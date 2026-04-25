import type { HeadsDownClient } from "@headsdown/sdk";

export type HeadsDownCallPayload = {
  key?: string | null;
  knownKey?: string | null;
  title?: string | null;
  body?: string | null;
  primaryActionLabel?: string | null;
};

const CURRENT_HEADSDOWN_CALL_QUERY = `
  query CurrentHeadsDownCall {
    agentControlOverview {
      headsdownCall {
        key
        knownKey
        title
        body
        primaryActionLabel
      }
    }
  }
`;

export async function getCurrentHeadsDownCallCompat(
  client: HeadsDownClient,
): Promise<HeadsDownCallPayload | null> {
  const graphql = getLowLevelGraphQLClient(client);
  if (!graphql) {
    return null;
  }

  try {
    const data = await graphql.request(CURRENT_HEADSDOWN_CALL_QUERY);
    const overview =
      (data.agentControlOverview as {
        headsdownCall?: HeadsDownCallPayload | null;
      } | null) ?? null;
    return overview?.headsdownCall ?? null;
  } catch {
    return null;
  }
}

function getLowLevelGraphQLClient(client: HeadsDownClient): {
  request: (query: string, variables?: Record<string, unknown>) => Promise<Record<string, unknown>>;
} | null {
  const maybeGraphQL = (client as unknown as { graphql?: unknown }).graphql;
  if (!maybeGraphQL || typeof maybeGraphQL !== "object") return null;

  const request = (maybeGraphQL as { request?: unknown }).request;
  if (typeof request !== "function") return null;

  return {
    request: request.bind(maybeGraphQL) as (
      query: string,
      variables?: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>,
  };
}
