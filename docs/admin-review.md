# Admin Review Queue

The review dashboard is available at `/admin/review` to an authenticated admin session.

## Accept all pending

The **Accept all pending** button runs the `acceptAllPendingReview` server action. It is an admin-only dashboard operation, not a public Agent API endpoint.

The action runs in one database transaction and accepts the review items currently represented by the dashboard:

- clears `needsReview` and `reviewReasons` on flagged heroes, items, and abilities;
- approves automatic text entries and clears stale text flags;
- clears flags on Séance categories whose synced membership changes need review.

It does not alter aliases, category values, memberships, text content, puzzle assignments, or approval status of Séance categories. The existing admin session check and confirmation prompt protect the operation.

Agents cannot invoke this action through `/api/agent/v1`; agent writes remain subject to the documented draft-only and approval rules in [the Agent API reference](agent-api.md).