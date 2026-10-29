"""Domain tags from Epoch's benchmark hub, the source Epoch's ECI page uses for its presets.

The tags aren't in the zip or in any data file; the hub publishes them in the benchmark
registry module its ECI page loads. That module is found by following the page's script
imports and read with a JavaScript parser, never executed.
"""

import re
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

import pandas as pd
import tree_sitter_javascript
from tree_sitter import Language, Node, Parser

from eci_live import source
from eci_live.schema import DomainBenchmark, InputInfo

# The registry holds about a hundred benchmarks; anything much smaller is another module.
MIN_ENTRIES = 20
MAX_MODULES = 80
COMPONENT_URL = re.compile(r'component-url="([^"]+)"')


class HubError(RuntimeError):
    """The benchmark registry couldn't be found or read."""


@dataclass(frozen=True)
class HubBenchmark:
    id: str
    title: str
    domains: tuple[str, ...]
    percentage: bool
    hidden: bool


_PARSER = Parser(Language(tree_sitter_javascript.language()))


def _get(url: str) -> bytes:
    request = Request(
        url, headers={"User-Agent": "eci-live (+https://github.com/soffits/eci-live)"}
    )
    with urlopen(request, timeout=60) as response:
        body: bytes = response.read()
    return body


def _text(src: bytes, node: Node) -> str:
    return src[node.start_byte : node.end_byte].decode()


def _literal(src: bytes, node: Node) -> Any:
    """The value of a string, template without substitutions, string array or boolean
    literal (including minified `!0` / `!1`); None for anything else."""
    if node.type in ("string", "template_string"):
        if any(c.type == "template_substitution" for c in node.named_children):
            return None
        parts = [c for c in node.named_children if c.type in ("string_fragment", "escape_sequence")]
        return "".join(_text(src, c) for c in parts)
    if node.type == "array":
        values = [_literal(src, c) for c in node.named_children]
        return values if all(isinstance(v, str) for v in values) else None
    if node.type in ("true", "false"):
        return node.type == "true"
    if node.type == "unary_expression" and _text(src, node) in ("!0", "!1"):
        return _text(src, node) == "!0"
    return None


def registry_entries(src: bytes) -> list[HubBenchmark]:
    """Every object literal shaped like a registry entry (`id`, `title`, `slug`)."""
    tree = _PARSER.parse(src)
    entries: list[HubBenchmark] = []
    stack = [tree.root_node]
    while stack:
        node = stack.pop()
        stack.extend(node.named_children)
        if node.type != "object":
            continue
        props: dict[str, Any] = {}
        for pair in node.named_children:
            key, value = pair.child_by_field_name("key"), pair.child_by_field_name("value")
            if pair.type == "pair" and key is not None and value is not None:
                props[_text(src, key).strip("\"'`")] = _literal(src, value)
        if isinstance(props.get("id"), str) and isinstance(props.get("title"), str):
            if "slug" not in props:
                continue
            entries.append(
                HubBenchmark(
                    id=props["id"],
                    title=props["title"],
                    domains=tuple(props.get("domains") or ()),
                    percentage=props.get("non_percentage_score") is not True,
                    hidden=props.get("hidden") is True,
                )
            )
    return entries


def _imports(src: bytes) -> list[str]:
    tree = _PARSER.parse(src)
    out = []
    for node in tree.root_node.named_children:
        if node.type in ("import_statement", "export_statement"):
            spec = node.child_by_field_name("source")
            if spec is not None and isinstance(path := _literal(src, spec), str):
                out.append(path)
    return out


def find_registry(page_url: str) -> tuple[str, bytes]:
    """(URL, body) of the registry module: breadth-first through the page's island
    scripts and their static imports on the same host, modules named like benchmarks first."""
    html = _get(page_url).decode()
    host = urlparse(page_url).netloc
    queue = deque(urljoin(page_url, u) for u in COMPONENT_URL.findall(html))
    seen: set[str] = set(queue)
    for _ in range(MAX_MODULES):
        if not queue:
            break
        url = queue.popleft()
        body = _get(url)
        if len(registry_entries(body)) >= MIN_ENTRIES:
            return url, body
        found = [urljoin(url, p) for p in _imports(body)]
        fresh = [u for u in found if urlparse(u).netloc == host and u not in seen]
        seen.update(fresh)
        queue.extend(sorted(fresh, key=lambda u: "benchmark" not in Path(u).name))
    raise HubError(f"no benchmark registry module found from {page_url}")


def fetch(page_url: str, dest: Path) -> tuple[InputInfo, list[HubBenchmark]]:
    """Find the registry, keep a copy at `dest`, and describe it like any input."""
    module_url, body = find_registry(page_url)
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(body)
    info = source.local(dest)
    info["url"] = module_url
    return info, registry_entries(body)


def _key(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower())


def match(
    entries: list[HubBenchmark], index: list[str], metadata: pd.DataFrame
) -> list[DomainBenchmark]:
    """Each index benchmark's hub entry, matched as Epoch's page does (id or title, case and
    punctuation ignored), else by the zip's source file name (`gso_external.csv` -> `gso`)."""
    by_name: dict[str, HubBenchmark] = {}
    by_id: dict[str, HubBenchmark] = {}
    for e in entries:
        by_name.setdefault(_key(e.id), e)
        by_name.setdefault(_key(e.title), e)
        by_id.setdefault(_key(e.id), e)
    files = {
        str(r["benchmark"]): Path(str(r["source_file"])).stem.removesuffix("_external")
        for r in metadata.dropna(subset=["source_file"]).to_dict("records")
    }
    out: list[DomainBenchmark] = []
    for name in index:
        entry = by_name.get(_key(name))
        if entry is None and name in files:
            entry = by_id.get(_key(files[name]))
        out.append(
            DomainBenchmark(
                benchmark=name,
                hub_id=entry.id if entry else None,
                domains=list(entry.domains) if entry else [],
                percentage=entry.percentage if entry else True,
                listed=not entry.hidden if entry else False,
            )
        )
    return out


def in_domain(benchmarks: list[DomainBenchmark], domain: str) -> list[str]:
    """Epoch's preset rule: tagged with the domain, scored as a percentage, and listed on
    the hub (retired versions, such as FrontierMath v1, are hidden there)."""
    return [
        b["benchmark"]
        for b in benchmarks
        if domain in b["domains"] and b["percentage"] and b["listed"]
    ]
