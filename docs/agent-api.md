# Guesslock Agent API (v1)

The Guesslock Agent API enables authorized external agents and automation tools to inspect puzzle states, retrieve entity and category definitions, patch tags and aliases, curate attribute categories, draft Séance groups, and regenerate or override future puzzles.

---

## 1. Authentication & Security

All requests must supply an `Authorization` header containing a valid Bearer token:

```http
Authorization: Bearer <TOKEN>
```

### Tokens & Scopes
- **Read Token** (`AGENT_API_READ_TOKEN`): Grants access to `GET` endpoints.
- **Write Token** (`AGENT_API_WRITE_TOKEN`): Grants access to all `GET`, `POST`, and `PATCH` endpoints.
- Both tokens must be 32+ random characters.
- If tokens are unset or unconfigured on the server, the entire API responds with `404 Not Found`.

### Security Guarantees
- **Constant-time comparison**: Mitigates timing attacks on token validation.
- **Rate limiting**:
  - Max 120 read requests per minute per token.
  - Max 30 write requests per minute per token.
- **Brute-force protection**: 10 failed auth attempts per client IP per minute triggers throttling + 300 ms intentional delay.
- **Body limits**: Max 200 KB per request body; strict Zod validation rejects unknown fields.
- **Audit logging**: Non-dry-run write operations are recorded in the database as a `SyncRun` entry (`kind: agent-api`), visible on the Admin dashboard under Recent Runs.
- **Caching**: All endpoints respond with `Cache-Control: no-store`.

---

## 2. Universal API Rules

1. **Future Dates Only**:
   - Puzzles for today and past days are immutable through the API.
   - Puzzles can only be regenerated or overridden for dates strictly after today (`date > today`).
2. **Drafts Only**:
   - Newly created Séance categories are initialized with `status: "draft"` and `source: "curated"`.
   - Categories can only be promoted to `status: "approved"` if `AGENT_API_ALLOW_APPROVE=1` is configured on the server AND the category is complete (all active heroes classified).
3. **No Deletes**:
   - The Agent API does not expose deletion of entities, categories, or puzzle records.
4. **Dry-Run Mode**:
   - Append `?dryRun=1` to any write request (`POST` or `PATCH`) to perform complete validation and schema checks without making database changes.

---

## 3. Endpoints

### 3.1 API Index
- **Method:** `GET`
- **Path:** `/api/agent/v1`
- **Scope:** `read`
- **Description:** Lists all available endpoints, locks, and rules.

#### Example
```bash
curl -X GET https://guesslock.paulkuehn.ch/api/agent/v1 \
  -H "Authorization: Bearer $AGENT_API_READ_TOKEN"
```

---

### 3.2 Global State Snapshot
- **Method:** `GET`
- **Path:** `/api/agent/v1/state`
- **Scope:** `read`
- **Query Parameters:**
  - `include` (comma-separated): `heroes`, `abilities`, `items`, `categories`, `seance`, `members`, `locks`, `coverage` (answer pool size, no-repeat window and sealed days ahead per lock). Default: `locks,categories,seance`.

#### Example
```bash
curl -X GET "https://guesslock.paulkuehn.ch/api/agent/v1/state?include=heroes,categories" \
  -H "Authorization: Bearer $AGENT_API_READ_TOKEN"
```

---

### 3.3 Puzzle State
- **Method:** `GET`
- **Path:** `/api/agent/v1/puzzles/:slug`
- **Scope:** `read`
- **Query Parameters:**
  - `date`: Date in `YYYY-MM-DD` format (defaults to current server date).

#### Example
```bash
curl -X GET "https://guesslock.paulkuehn.ch/api/agent/v1/puzzles/visage?date=2026-10-05" \
  -H "Authorization: Bearer $AGENT_API_READ_TOKEN"
```

---

### 3.4 Puzzle Actions (Regenerate / Override)
- **Method:** `POST`
- **Path:** `/api/agent/v1/puzzles/:slug`
- **Scope:** `write`
- **Query Parameters:**
  - `dryRun=1`: Validate without applying.
- **Request Body:**
  ```json
  {
    "date": "2026-10-05",
    "action": "regenerate"
  }
  ```
  Or to override with a specific answer ID:
  ```json
  {
    "date": "2026-10-05",
    "action": "override",
    "answerId": "1"
  }
  ```
  *(Note: `override` is not supported for Séance tables or Omens).*

#### Example
```bash
curl -X POST "https://guesslock.paulkuehn.ch/api/agent/v1/puzzles/visage" \
  -H "Authorization: Bearer $AGENT_API_WRITE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"date":"2026-10-05","action":"regenerate"}'
```

---

### 3.5 Entity State
- **Method:** `GET`
- **Path:** `/api/agent/v1/entities/:kind/:id`
- **Scope:** `read`
- **Parameters:**
  - `kind`: `heroes` | `abilities` | `items`
  - `id`: Numeric entity ID

#### Example
```bash
curl -X GET https://guesslock.paulkuehn.ch/api/agent/v1/entities/heroes/1 \
  -H "Authorization: Bearer $AGENT_API_READ_TOKEN"
```

---

### 3.6 Patch Entity
- **Method:** `PATCH`
- **Path:** `/api/agent/v1/entities/:kind/:id`
- **Scope:** `write`
- **Query Parameters:**
  - `dryRun=1`: Validate without applying.
- **Request Body:**
  ```json
  {
    "aliases": { "add": ["Infernus"], "remove": ["OldAlias"] },
    "excludeFromModes": { "add": ["lock-cipher"] },
    "values": {
      "hero.species": "Human"
    },
    "setup": {
      "buildPin": ["item_spirit_armor"],
      "buildBan": ["item_curse"]
    }
  }
  ```
  *(Note: `values` only supported for `heroes` and `items`; `setup` only supported for `heroes`).*

#### Example
```bash
curl -X PATCH "https://guesslock.paulkuehn.ch/api/agent/v1/entities/heroes/1" \
  -H "Authorization: Bearer $AGENT_API_WRITE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"aliases":{"add":["Magician"]}}'
```

---

### 3.7 Attribute Categories (List & Create)
- **Method:** `GET` / `POST`
- **Path:** `/api/agent/v1/categories`
- **GET Scope:** `read` (`?entity=hero|item`)
- **POST Scope:** `write`
- **POST Body:**
  ```json
  {
    "entity": "hero",
    "label": "Favorite Weapon",
    "type": "exact",
    "unit": "",
    "info": "Primary weapon category"
  }
  ```

#### Example
```bash
curl -X POST "https://guesslock.paulkuehn.ch/api/agent/v1/categories" \
  -H "Authorization: Bearer $AGENT_API_WRITE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"entity":"hero","label":"Movement Speed Tier","type":"numeric","unit":"m/s"}'
```

---

### 3.8 Patch Attribute Category
- **Method:** `PATCH`
- **Path:** `/api/agent/v1/categories/:entity/:key`
- **Scope:** `write`
- **Parameters:**
  - `entity`: `hero` | `item`
  - `key`: Slug key (e.g. `movement-speed-tier`)
- **Body:**
  ```json
  {
    "label": "Movement Speed Tier",
    "info": "Updated description",
    "enabled": true,
    "order": 120
  }
  ```

---

### 3.9 Séance, Bazaar and Grimoire Categories (List & Create)

The sorting puzzles come in three libraries, selected by `entity`: `hero` (The Séance: types `mechanics`, `visuals`, `lore`), `item` (The Bazaar: `stats`, `effects`, `visuals`) and `ability` (The Grimoire: `mechanics`, `effects`, `visuals`). Member ids are hero, item or ability ids of that entity. Lists return `unknownIds` / `memberIds`.

- **Method:** `GET` / `POST`
- **Path:** `/api/agent/v1/seance/categories`
- **GET Scope:** `read` (supports `?members=1` or `?withMembers=1`)
- **POST Scope:** `write`
- **POST Body:**
  ```json
  {
    "entity": "hero",
    "type": "lore",
    "label": "The Baron's Court",
    "explanation": "Heroes affiliated with the Baronial courts.",
    "difficulty": 2,
    "members": {
      "add": [1, 4, 12, 18],
      "notMembers": [2, 3, 5],
      "completeRest": false
    }
  }
  ```

---

### 3.10 Single Séance Category (Get & Patch)
- **Method:** `GET` / `PATCH`
- **Path:** `/api/agent/v1/seance/categories/:id`
- **GET Scope:** `read`
- **PATCH Scope:** `write`
- **PATCH Body:**
  ```json
  {
    "label": "The Baron's Inner Circle",
    "explanation": "Clarified lore criteria.",
    "difficulty": 3,
    "status": "draft",
    "members": {
      "add": [7],
      "completeRest": true
    }
  }
  ```

---

## 4. Error Responses

Errors return standard JSON objects with an HTTP error status code:

```json
{
  "error": "Error message description",
  "extra": {}
}
```

| HTTP Status | Description |
|:---|:---|
| **400 Bad Request** | Invalid query parameter or URL segment format. |
| **401 Unauthorized** | Missing or malformed `Authorization: Bearer <TOKEN>` header. |
| **403 Forbidden** | Insufficient token scope (e.g. read token used on a write route) or unpermitted approval. |
| **404 Not Found** | Token unconfigured, unknown route, unknown entity, or missing resource. |
| **409 Conflict** | Category already exists or attempts to overwrite built-in columns. |
| **422 Unprocessable** | Request body validation error, past date supplied, unknown modes, or invalid hero IDs. |
| **429 Too Many Requests** | Rate limit exceeded or brute-force protection triggered. |
| **500 Internal Error** | Unexpected server execution failure. |
