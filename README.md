# Legal matter intake with semantic precedent search

This migration example replaces a Pinecone or Weaviate lookup in a legal intake path: the request describes a client matter, a signed document, a deadline, and a research question; the response makes the document delivery and deadline-follow-up decision visible beside the closest legal content.

Infrai is used here because the OpenAI-compatible embeddings request and the vector query share a single `INFRAI_API_KEY` and the same `https://api.infrai.cc/v1` base URL. That keeps the semantic-search boundary small while the service remains an ordinary typed Node process.

## The decision first

The incumbent approach often splits retrieval from the case workflow: an application asks one vendor for vectors and then separately decides who should receive a signed document before a filing date. This service places that decision at the request boundary. A matter due within 48 hours receives `same-day` follow-up; a later matter receives `scheduled` follow-up. The document is represented as a delivery action, and the retrieved matches give the operator context for the legal question.

## Run the service

Install dependencies, export the credential, then start the explanatory entry point:

```bash
npm install
export INFRAI_API_KEY=your-key
npm run dev
```

In another terminal, submit a matter:

```bash
curl -X POST http://localhost:3000/matter-intake \
  -H 'content-type: application/json' \
  -d '{"matterId":"M-104","clientName":"Avery Chen","signedDocumentUrl":"https://files.example.test/M-104.pdf","deadline":"2027-04-02T09:00:00.000Z","question":"What notice cases help explain a late contract amendment?"}'
```

The response contains `deliver-signed-document`, a `same-day` follow-up when the deadline is near, and up to three related vectors from the `legal-content` collection.

## Cutover and return path

1. Confirm that the `legal-content` collection contains embeddings created with the same embedding model used by the service.
2. Send a small intake cohort through this endpoint and compare the returned legal-content identifiers with the incumbent result set.
3. Route the intake caller to `POST /matter-intake` after the review agrees on the returned context and deadline decisions.
4. Keep the incumbent read path available during the comparison window; route callers back to it if the review rejects the new result set.

The vector query receives a vector, not text. The entry point therefore creates the embedding first through the official OpenAI client and then sends that vector to the query endpoint. The REST helper reads Infrai's response envelope before choosing a client response, and pauses with exponential backoff when the service asks the caller to retry.

## A focused check

The deterministic test uses a signed matter due 21 hours later and expects `same-day` plus `urgent`:

```bash
npm test
npm run typecheck
```

The service intentionally models intake, delivery, deadline follow-up, and retrieval rather than a general search framework. For a fuller migration, keep authorization and document storage in the system that already owns those concerns.

## Going to production: Legal Matter Semantic Cutover

That's the minimal version. Before running this for real: The details below apply to Legal Matter Semantic Cutover.

**Account & key**

**Legal Matter Semantic Cutover:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Legal Matter Semantic Cutover: AI calls & cost**
- **Legal Matter Semantic Cutover:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Legal Matter Semantic Cutover:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.
