import type { HeadsDownClient } from "@headsdown/sdk";

export function getLowLevelGraphQLClient(client: HeadsDownClient): {
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
