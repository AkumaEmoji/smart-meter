# MeterLens REST API v1

This is the stable read contract for the web backend and the future Unity
Quest client. The existing `GET /api/data` array remains available for the
current browser dashboard. New clients should use the v1 routes below.

## Connection model

- Transport: HTTPS REST polling.
- WebSocket: not implemented.
- Server-Sent Events: not implemented.
- Recommended latest-reading poll interval: 3 seconds.
- Authentication: read routes are public for the current university demo.
- Caching: the latest and history routes send `Cache-Control: no-store`.

## `GET /api/v1/readings/latest`

Returns the newest Firestore document after normalizing the legacy storage
shape. It queries one document on every request and does not use the legacy
60-second process-memory cache.

Example `200 OK` response:

```json
{
  "schemaVersion": 1,
  "sampleId": "firestore-document-id",
  "meterId": "dtz541-demo",
  "timestamp": "2026-07-14T17:00:00.000Z",
  "receivedAt": "2026-07-14T17:00:00.000Z",
  "powerW": 742,
  "energyImportTotalKwh": 1240.52,
  "energyExportTotalKwh": 12.31,
  "phasePowerW": { "l1": null, "l2": null, "l3": null },
  "voltageV": { "l1": null, "l2": null, "l3": null },
  "currentA": { "l1": null, "l2": null, "l3": null },
  "frequencyHz": null,
  "rawObis": null,
  "quality": {
    "source": "meter",
    "meterDataset": "complete",
    "status": "ok",
    "isSimulated": false,
    "available": [
      "powerW",
      "energyImportTotalKwh",
      "energyExportTotalKwh"
    ]
  },
  "freshness": {
    "state": "fresh",
    "ageSeconds": 2,
    "staleAfterSeconds": 30
  }
}
```

If Firestore has no readings, the route returns `404`:

```json
{ "error": "No meter readings found" }
```

### Null and quality rules

- A real numeric zero remains `0`.
- A missing, empty, or non-finite measurement becomes `null`.
- Phase objects always contain `l1`, `l2`, and `l3`; unavailable values are
  `null`.
- Legacy Firestore documents without metadata use the configured `METER_ID`
  and `quality.source: "legacy"`.
- `quality.status` is `ok` when all three current base measurements and a valid
  timestamp exist, `partial` when only some measurements exist, and `invalid`
  when the timestamp or all measurements are unavailable.
- `freshness.state` is separate from measurement quality. It is `fresh`,
  `stale`, or `unknown` using a 30-second threshold.
- New simulator records have `quality.source: "simulator"` and
  `quality.isSimulated: true`.
- `quality.meterDataset` is `reduced`, `complete`,
  `manufacturer-specific`, or `unknown` for legacy records.
- New physical readings include a safe `rawObis` map of recognized electrical
  registers. Meter identity values are not copied into that API field.

## `GET /api/v1/readings`

Returns a bounded history envelope and an energy summary calculated from
changes in the cumulative import/export registers.

Query parameters:

| Name | Default | Rules |
|---|---:|---|
| `from` | none | ISO-8601 timestamp with timezone, inclusive |
| `to` | none | ISO-8601 timestamp with timezone, inclusive |
| `limit` | `300` | Whole number from 1 to 1000 |
| `order` | `desc` | `asc` or `desc` |

Example:

```text
GET /api/v1/readings?from=2026-07-14T00:00:00Z&to=2026-07-15T00:00:00Z&limit=500&order=asc
```

Example response envelope:

```json
{
  "schemaVersion": 1,
  "meterId": "dtz541-demo",
  "query": {
    "from": "2026-07-14T00:00:00.000Z",
    "to": "2026-07-15T00:00:00.000Z",
    "limit": 500,
    "order": "asc"
  },
  "count": 2,
  "readings": [],
  "summary": {
    "sampleCount": 2,
    "periodStart": "2026-07-14T10:00:00.000Z",
    "periodEnd": "2026-07-14T10:10:00.000Z",
    "energyImportDeltaKwh": 0.25,
    "energyExportDeltaKwh": 0.05,
    "importResetCount": 0,
    "exportResetCount": 0,
    "isComplete": true
  }
}
```

Each `readings` item uses the same shape as the latest endpoint. The summary is
calculated only across the returned samples. A decrease in a cumulative
register is treated as a reset/rollover boundary: it is never returned as
negative consumption, its reset counter increases, and `isComplete` becomes
false. A delta is `null` when fewer than two comparable samples exist.

Invalid query parameters return `400`. A valid range with no readings returns
`200` with an empty `readings` array and null deltas.

## `GET /api/v1/capabilities`

Returns the connection mode, routes, limits, units, and truthful field
availability. It queries the latest stored reading and includes an
`observation` object identifying the sample and detected INFO dataset used for
the decision. Each phase group also contains per-phase availability flags.

Phase power, voltage, current, and frequency are advertised as available only
when the latest reading contains them. This prevents a complete INFO dataset
from being mistaken for the richer manufacturer-specific dataset. If the
database is empty, the endpoint falls back to the known base pipeline contract.

Unity should query this endpoint at startup and disable unavailable tabs rather
than showing fabricated zeroes. The response uses `Cache-Control: no-store` so
a newly captured richer dataset is visible immediately.

The 2026-07-15 physical capture observed `meterDataset: "complete"`. For the
current meter configuration, total power, import/export totals, and the safe
raw OBIS view are available; phase power, voltage, current, and frequency are
not supplied and therefore remain unavailable.

## Legacy ingestion: `POST /api/data`

The existing authenticated ingestion endpoint remains the write route. It
requires:

```text
Authorization: Bearer <SMART_METER_INGEST_TOKEN>
```

It accepts the existing flat, nested OBIS, and `raw_data` families. New writes
also store `schemaVersion`, `meterId`, `source`, and `receivedAt`. Optional
top-level metadata is validated:

```json
{
  "meterId": "dtz541-demo",
  "source": "simulator",
  "power": 742,
  "importKwh": 1240.52,
  "exportKwh": 12.31
}
```

Allowed sources are `api`, `meter`, `simulator`, and `manual`. The physical
`meter.cjs` path still writes directly to Firestore and now stores the same
metadata with `source: "meter"`.

## Error contract

- `400`: invalid history query or ingestion body.
- `401`: missing or incorrect ingestion Bearer token.
- `404`: no reading exists for the latest route.
- `405`: method not supported; the `Allow` header identifies `GET` or
  `GET, POST` for the legacy route.
- `500`: internal backend error with no credential or Firestore details.
- `503`: ingestion is not configured because the server token is missing.

## Unity mapping

The Quest client should deserialize v1 into its own `MeterReading` domain
model, poll the latest route, and trigger a visual pulse only when `sampleId` or
`timestamp` changes. It should fetch history only when a time-range view opens.
It must keep `fresh`, `stale`, `offline`, and `simulated` as distinct states.
