import json
import os
import shlex
from datetime import datetime, timezone
from pathlib import Path

from mitmproxy import http


OUTPUT_DIR = Path(os.environ.get("TRAFFIC_ROBOT_OUTPUT", Path.home() / "TrafficRobotCaptures"))
OUTPUT_FILE = OUTPUT_DIR / "transactions.jsonl"
MAX_BODY_BYTES = 100_000
SENSITIVE_HEADERS = {"authorization", "cookie", "proxy-authorization", "set-cookie"}


def safe_headers(headers):
    result = {}
    for name, value in headers.items(multi=True):
        result[name] = "[REDACTED]" if name.lower() in SENSITIVE_HEADERS else value
    return result


def body_text(content):
    if not content:
        return ""
    return content[:MAX_BODY_BYTES].decode("utf-8", errors="replace")


def curl_command(flow):
    request = flow.request
    parts = ["curl", "-i", "-X", request.method]
    for name, value in safe_headers(request.headers).items():
        parts.extend(["-H", f"{name}: {value}"])
    request_body = body_text(request.raw_content)
    if request_body:
        parts.extend(["--data-raw", request_body])
    parts.append(request.pretty_url)
    return " ".join(shlex.quote(part) for part in parts)


def response(flow: http.HTTPFlow):
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    request = flow.request
    reply = flow.response
    record = {
        "time": datetime.fromtimestamp(request.timestamp_start, timezone.utc).isoformat(timespec="milliseconds"),
        "method": request.method,
        "url": request.pretty_url,
        "request_headers": safe_headers(request.headers),
        "request_body": body_text(request.raw_content),
        "status": reply.status_code if reply else None,
        "response_headers": safe_headers(reply.headers) if reply else {},
        "response_body": body_text(reply.raw_content) if reply else "",
        "curl": curl_command(flow),
    }
    with OUTPUT_FILE.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=False) + "\n")
    print(
        f"[traffic-robot] {record['time']} {record['method']} "
        f"{record['status']} {record['url']}"
    )
