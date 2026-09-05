import { DIAGRAM_LIMITS } from "../constants/diagram";
import type { ObjectProperties } from "../types";
import { DIAGRAM_GUIDELINES } from "./guidelines";

/**
 * The prompts a person copies out of the editor and pastes into a coding agent
 * — Claude Code, Codex, Cursor — that already has their repository open.
 *
 * Like `DIAGRAM_SKETCH_PROMPT`, each one is `DIAGRAM_GUIDELINES` with a
 * preamble, never a second document: the contract has exactly one text, and
 * what changes when the input is a codebase is how to *read* it. Composing
 * rather than copying is what keeps a pasted prompt from describing a format
 * the validator no longer accepts.
 *
 * There are three shapes because "the architecture of this repo" is three
 * different drawings, and a model asked for all three at once draws a muddle:
 * the request path with the test runner wired into it. A shape says, before
 * anything else, what counts as a node.
 *
 * The reading rules are the same for all three, and so is the privacy stance:
 * the repository is the team's and stays on their machine. The agent reads it
 * there; the only thing that ever travels is a JSON document naming
 * technologies, and the prompt has to say so because the agent is the one
 * deciding what goes into it.
 */

export const REPOSITORY_PROMPT_SHAPES = {
  RUNTIME_FLOW: "runtime-flow",
  FULL_STACK: "full-stack",
  LAYERS: "layers",
} as const;

export type RepositoryPromptShape = ObjectProperties<typeof REPOSITORY_PROMPT_SHAPES>;

export interface RepositoryPrompt {
  shape: RepositoryPromptShape;
  /** What the selector button says. */
  label: string;
  /** One line under the selector: what this shape draws, so nobody has to try all three. */
  blurb: string;
  /** The full text to paste, guidelines included. */
  prompt: string;
}

/** The order the panel lists the shapes in — the plainest drawing first. */
export const REPOSITORY_PROMPT_ORDER: RepositoryPromptShape[] = [
  REPOSITORY_PROMPT_SHAPES.RUNTIME_FLOW,
  REPOSITORY_PROMPT_SHAPES.FULL_STACK,
  REPOSITORY_PROMPT_SHAPES.LAYERS,
];

/**
 * How to read a repository for its stack — shared by every shape.
 *
 * The order is deliberate: what the team wrote down in words outranks anything
 * inferred from a lockfile, and the lockfile is consulted last because it
 * answers one narrow question. Business logic is off limits because that is the
 * request the feature was born from: read the technologies as technologies.
 */
const REPOSITORY_READING = `You are a coding agent — Claude Code, Codex, Cursor or similar — with a
repository open in your workspace. That repository is the only input: whatever
its files do not show, you do not have.

## What leaves this machine

Nothing but the JSON. The analysis happens here, on the repository as it sits
on disk, and the document you return names technologies and the roles they
play — that is all it may carry. No source code, no file paths, no hostnames,
no credentials, no environment values, and nothing lifted from a private
document that is not the name of a technology. The person will paste your reply
into a diagram editor; write it as if everyone outside the team will read it.

## What to read, in this order

Read for the stack, not for the behaviour. Stop as soon as the list below has
answered what the system is made of.

1. What the team already wrote down: the README, \`docs/\`, architecture notes,
   ADRs, \`CLAUDE.md\`, \`AGENTS.md\`. A sentence there saying "deployed to
   Cloudflare Workers in front of Neon" is stronger evidence than anything you
   can infer from a dependency list.
2. Manifests and workspace configuration: \`package.json\` and its workspaces,
   \`pyproject.toml\`, \`go.mod\`, \`Cargo.toml\`, \`Gemfile\`, \`pom.xml\`,
   \`turbo.json\`, \`pnpm-workspace.yaml\`. Dependencies say which frameworks are
   present; scripts say which of them actually run.
3. The lockfile, only to settle what the manifests left open — which of two
   ORMs is really installed, which major version of a framework.
4. Deployment and infrastructure: \`Dockerfile\`, \`docker-compose.*\`,
   \`wrangler.*\`, \`vercel.json\`, \`netlify.toml\`, \`fly.toml\`, \`serverless.*\`,
   Terraform, Pulumi, CDK, Kubernetes manifests, Helm charts, and the CI
   workflows under \`.github/\`, \`.gitlab-ci.yml\` or the equivalent. These say
   where each piece runs and what it is deployed to.
5. Entrypoints and route registries: the file each deployable starts from, the
   server or router setup, the framework config (\`next.config.*\`,
   \`vite.config.*\`, \`app.config.*\`). Read them for what they wire up — a
   database client, a queue, an auth provider — not for what the handlers do.
6. Integration configuration: the database schema and ORM config, the
   migrations folder, queue and cache clients, SDK initialisers for external
   services, and the *names* of environment variables — never their values.

## What not to read

- Business logic. Do not read handlers, services, use cases, components,
  models or tests. What a route does is not part of this diagram; that the
  route exists and talks to Postgres is.
- \`.env\`, \`.dev.vars\`, anything under \`secrets/\`, keys, tokens,
  certificates. Never open them, and never let a value from one appear in your
  answer even if you happened to see it elsewhere.
- Generated and vendored code: \`node_modules\`, \`dist\`, \`build\`, \`.next\`,
  \`target\`, \`vendor\` — and the lockfile beyond the check in step 3.

## Do not invent

A technology enters the diagram only with evidence in a file you read: a
dependency, a config file, a deploy target, a sentence in the README. No cache
because the app "probably has one", no load balancer because most deployments
do, no queue because the framework supports it. A smaller diagram that matches
the repository beats a fuller one that does not.

## Names and roles

Write each technology the way its own product writes it — Postgres, NestJS,
Cloudflare Workers — not the way a folder or a package is named. For a piece
the team built, their name is its name: the \`apps/api\` workspace is "api"
unless the README calls it something else, and only the casing is yours.

Give every node a \`sub\`: its role, in one or two lowercase words — "web app",
"api service", "database", "queue". For a piece the team built, \`name\` is what
they call it and \`sub\` is what it is; for a technology, \`sub\` is the job it
does in this repository.`;

/** The checks every shape ends on, before its own. */
const COMMON_LAST_CHECKS = `- Is your reply anything other than one JSON document? Delete the rest.
- Does anything in your answer carry a secret, an environment value, a file path
  or a line of source? Remove it.
- Is every technology backed by a file you actually read? Remove what is not.
- Is any \`name\` a folder's name rather than the product's? Write it the way the
  product does.
- Does every node have a \`sub\`, and every boundary a \`tone\`?`;

/**
 * One prompt: the opening, the reading rules, what this shape calls a node,
 * the contract, and the checks — in that order, so the checks sit closest to
 * the answer.
 */
const composeRepositoryPrompt = ({
  whatIsANode,
  lastChecks,
}: {
  whatIsANode: string;
  lastChecks: string;
}) => `# Read this repository and return JSON

Your entire reply is one JSON document, described below. Nothing else.

**Do not draw, render or generate an image.** You are not making a picture:
another program draws it from the JSON you return. A reply containing an image,
a rendered diagram or any prose is a failed reply, however good the picture is.

${REPOSITORY_READING}

${whatIsANode}

---

${DIAGRAM_GUIDELINES}

---

## Last checks, for a diagram read from a repository

${COMMON_LAST_CHECKS}
${lastChecks}
`;

const RUNTIME_FLOW: RepositoryPrompt = {
  shape: REPOSITORY_PROMPT_SHAPES.RUNTIME_FLOW,
  label: "Runtime flow",
  blurb:
    "The pieces that move data while the system runs — apps, databases, queues, external APIs — wired with protocols. No tooling.",
  prompt: composeRepositoryPrompt({
    whatIsANode: `## What is a node: only what moves data at runtime

A component belongs in this diagram when it runs, stores or moves data while
the system is serving requests: the deployable applications and services, the
databases, caches, queues and object stores, the auth provider, the third-party
APIs the code calls, and the client that talks to it all — a browser, a mobile
app, a person at a CLI. Wire them with \`solid\` edges labelled with the
protocol, and let that path read left to right.

Everything that only exists while building, testing or shipping is **not a
node**: the package manager, the monorepo tool, the bundler, the test runner,
the linter, the CI system, the language itself. The tooling is real, but it is
not in the request path, and this diagram is the request path. Leave it out
entirely rather than parking it in a corner.

Draw a boundary only for a perimeter the runtime really has — a cloud provider,
a region, a cluster, a VPC. The monorepo is not one; the code lives there, the
system does not run there.`,
    lastChecks: `- Is any build tool, test runner, linter, language or CI system a node? Remove
  it — this shape draws the request path and nothing else.
- Does every \`solid\` edge carry a protocol, and does the path read left to
  right from the client to the store?`,
  }),
};

const FULL_STACK: RepositoryPrompt = {
  shape: REPOSITORY_PROMPT_SHAPES.FULL_STACK,
  label: "Full stack",
  blurb:
    "The runtime flow, plus the tooling that builds and ships it, grouped in boundaries off the main path.",
  prompt: composeRepositoryPrompt({
    whatIsANode: `## What is a node: the flow, and then the stack around it

Start exactly as a runtime diagram would: the components that run, store or
move data while the system is serving requests — applications, services,
databases, caches, queues, external APIs, and the client — wired with \`solid\`
edges labelled with the protocol, reading left to right. That is the spine, and
it comes first.

Then add what the flow leaves out: the language and runtime (TypeScript, Bun,
Node.js), the monorepo tool, the package manager, the bundler, the test runner,
the linter, the CI system, the styling framework, the ORM when it did not
already appear as an edge label. Each is a node — but a node inside a **group
with a boundary**, off the spine: "Monorepo — Turborepo + Bun workspaces",
"Tooling", "Runtime". Tooling carries **no solid edge**, because tooling does
not carry requests. Where a relation is worth drawing at all — Wrangler
deploys the worker, GitHub Actions runs the tests — it is a \`dashed\` edge, and
most of the time the boundary already says it and no edge is needed.

Keep the count honest: the contract allows at most ${DIAGRAM_LIMITS.MAX_NODES}
nodes and the spine is spent first. If the tooling would push past that, drop
the least distinctive tools — a formatter says less about a stack than its ORM.`,
    lastChecks: `- Is there a \`solid\` edge touching a tooling node? Make it \`dashed\` or remove
  it.
- Is every tooling node inside a group that has a boundary, and is the spine
  still readable left to right with the tooling out of its way?`,
  }),
};

const LAYERS: RepositoryPrompt = {
  shape: REPOSITORY_PROMPT_SHAPES.LAYERS,
  label: "Layers",
  blurb:
    "Every technology sorted into frontend, backend, data, infra and tooling — a photograph of the stack, not of a request.",
  prompt: composeRepositoryPrompt({
    whatIsANode: `## What is a node: every technology, sorted into its layer

This diagram is a photograph of the stack, not of a request. Draw **one
boundary per layer**, and put each technology inside the layer it belongs to,
one node each:

- **Frontend** — UI frameworks, rendering frameworks, styling, client state,
  the client bundler when it belongs to the app.
- **Backend** — server frameworks, API layers, server functions, auth,
  background workers.
- **Data** — databases, ORMs and query builders, caches, queues, object
  storage, search.
- **Infra** — hosting and compute platforms, CDNs, IaC, containers, CI/CD.
- **Tooling** — the language, runtime, package manager, monorepo tool, test
  runner, linter, formatter.

A layer with nothing in it is not drawn. Each layer is a group with a boundary
whose label is the layer's name plus what characterises it — "Data — Postgres
via Drizzle" — and whose tone follows the contract's meanings: the primary
platform tone for Infra, the tooling tone for Tooling, the data tone for Data,
neutral for the rest. List the layers frontend, backend, data, so the stack
reads left to right, with infra and tooling as the bands below.

Edges run **only between layers, never inside a layer**: one \`solid\` edge from
the frontend's framework to the backend's, one from the backend's framework to
the primary database, each labelled with the protocol. Nothing inside a layer
is wired to anything else inside it — Tailwind does not call React. Infra and
Tooling usually get no edges at all; where one is worth drawing (Wrangler
deploys the backend), it is \`dashed\`.`,
    lastChecks: `- Is any edge joining two nodes in the same layer? Remove it.
- Is every drawn layer a group with exactly one boundary, and is every
  technology in exactly one layer?`,
  }),
};

export const DIAGRAM_REPOSITORY_PROMPTS: Record<RepositoryPromptShape, RepositoryPrompt> = {
  [REPOSITORY_PROMPT_SHAPES.RUNTIME_FLOW]: RUNTIME_FLOW,
  [REPOSITORY_PROMPT_SHAPES.FULL_STACK]: FULL_STACK,
  [REPOSITORY_PROMPT_SHAPES.LAYERS]: LAYERS,
};
