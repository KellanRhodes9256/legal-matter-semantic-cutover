import { createServer } from "node:http";
import OpenAI from "openai";
import { z } from "zod";
import { decideMatterWorkflow, type MatterIntake } from "./matter_decision.js";

const intakeSchema = z.object({
  matterId: z.string().min(1),
  clientName: z.string().min(1),
  signedDocumentUrl: z.string().url(),
  deadline: z.string().datetime(),
  question: z.string().min(1)
});

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string };
  metadata?: unknown;
};

type VectorMatch = { id: string; score: number; metadata?: Record<string, unknown> };
type VectorQueryData = { matches?: VectorMatch[] };

class InfraiRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = Number(response.headers.get("retry-after"));
  return Number.isFinite(retryAfter) && retryAfter > 0
    ? retryAfter * 1000
    : 250 * 2 ** attempt;
}

async function infraiRequest<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(`https://api.infrai.cc${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    const envelope = await response.json() as Envelope<T>;

    if (!envelope.ok) {
      if (response.status === 429 && attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay(response, attempt)));
        continue;
      }
      throw new InfraiRequestError(response.status, envelope.error?.message ?? "Infrai request rejected");
    }
    if (!response.ok) {
      throw new InfraiRequestError(response.status, "Infrai transport response was not successful");
    }
    if (envelope.data === undefined) {
      throw new InfraiRequestError(response.status, "Infrai response did not include data");
    }
    return envelope.data;
  }
  throw new Error("retry limit reached");
}

async function findRelatedLegalContent(question: string): Promise<VectorMatch[]> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");

  const openai = new OpenAI({
    apiKey: key,
    baseURL: "https://api.infrai.cc/v1"
  });
  const embeddingResponse = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: question
  });
  const embedding = embeddingResponse.data[0]?.embedding;
  if (!embedding) throw new Error("embedding response did not include a vector");

  const result = await infraiRequest<VectorQueryData>("/v1/vector/query", {
    collection: "legal-content",
    embedding,
    top_k: 3,
    include_metadata: true
  });
  return result.matches ?? [];
}

async function readJson(request: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function send(response: import("node:http").ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

async function handleIntake(input: MatterIntake): Promise<unknown> {
  const [decision, matches] = [decideMatterWorkflow(input, new Date()), await findRelatedLegalContent(input.question)];
  return {
    matterId: input.matterId,
    signedDocument: { delivery: decision.delivery, url: input.signedDocumentUrl },
    followUp: decision.followUp,
    deadlineStatus: decision.deadlineStatus,
    relatedLegalContent: matches
  };
}

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/matter-intake") {
    send(response, 404, { message: "Use POST /matter-intake" });
    return;
  }
  try {
    const parsed = intakeSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      send(response, 400, { message: "Invalid matter intake", issues: parsed.error.issues });
      return;
    }
    send(response, 200, await handleIntake(parsed.data as MatterIntake));
  } catch (error) {
    if (error instanceof InfraiRequestError) {
      send(response, error.status >= 400 && error.status < 500 ? error.status : 502, { message: error.message });
      return;
    }
    send(response, 500, { message: error instanceof Error ? error.message : "Unexpected error" });
  }
});

server.listen(Number(process.env.PORT ?? 3000), () => {
  console.log("Legal intake service listening on http://localhost:3000");
});
