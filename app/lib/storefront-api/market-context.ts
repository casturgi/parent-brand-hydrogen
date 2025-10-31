import type {Storefront} from '@shopify/hydrogen';

/**
 * Injects the @inContext(market: { handle: $market }) directive into GraphQL queries
 * and adds the market variable from the environment.
 */
function injectMarketContext(query: string, marketHandle: string): string {
  if (!marketHandle) {
    return query;
  }

  // Check if @inContext already exists
  const hasInContext = /@inContext\s*\([^)]*\)/.test(query);

  // Check if $market variable is already declared
  const hasMarketVariable = /\$market\s*:\s*String!/.test(query);

  let modifiedQuery = query;

  // Add $market variable if it doesn't exist
  if (!hasMarketVariable) {
    // Find the query/mutation declaration line
    const queryMatch = query.match(/(query|mutation)\s+(\w+)\s*\(([^)]*)\)/);
    if (queryMatch) {
      const variableDeclarationStart = queryMatch.index! + queryMatch[0].length - 1;
      const beforeVars = modifiedQuery.substring(0, variableDeclarationStart);
      const afterVars = modifiedQuery.substring(variableDeclarationStart + 1);
      const existingVars = queryMatch[3].trim();

      if (existingVars) {
        // Add market variable to existing variables
        modifiedQuery = `${beforeVars}${existingVars}, $market: String!)${afterVars}`;
      } else {
        // Add market variable as the first variable
        modifiedQuery = `${beforeVars}$market: String!)${afterVars}`;
      }
    }
  }

  // Modify or add @inContext directive
  if (hasInContext) {
    // Replace existing @inContext to include market (use fresh regex for replace)
    modifiedQuery = modifiedQuery.replace(
      /@inContext\s*\([^)]*\)/g,
      (match) => {
        // Check if market is already in the directive
        if (/market\s*:\s*\{/.test(match)) {
          // Market already exists, return as-is
          return match;
        }
        // Extract the content inside the parentheses
        const contentMatch = match.match(/@inContext\s*\(([^)]*)\)/);
        if (!contentMatch) {
          return match;
        }
        
        const innerContent = contentMatch[1].trim();
        // Add market context (with comma if there are existing params)
        const separator = innerContent ? ', ' : '';
        return `@inContext(${innerContent}${separator}market: { handle: $market })`;
      },
    );
  } else {
    // Add @inContext directive before the opening brace of the query/mutation
    // Find the position after the closing parenthesis of variable declarations
    const queryNameMatch = modifiedQuery.match(/(query|mutation)\s+(\w+)\s*\([^)]*\)\s*/);
    if (queryNameMatch) {
      const directivePosition = queryNameMatch.index! + queryNameMatch[0].length;
      const beforeDirective = modifiedQuery.substring(0, directivePosition);
      const afterDirective = modifiedQuery.substring(directivePosition);
      modifiedQuery = `${beforeDirective}@inContext(market: { handle: $market }) ${afterDirective}`;
    }
  }

  return modifiedQuery;
}

/**
 * Wraps a Storefront client to automatically inject market context into all queries.
 */
export function wrapStorefrontWithMarket(
  storefront: Storefront,
  marketHandle?: string,
): Storefront {
  if (!marketHandle) {
    return storefront;
  }

  // Create a proxy that intercepts the query method
  return new Proxy(storefront, {
    get(target, prop) {
      const value = Reflect.get(target, prop);

      // Intercept the query method
      if (prop === 'query' && typeof value === 'function') {
        return function wrappedQuery(query: string, options?: any) {
          const modifiedQuery = injectMarketContext(query, marketHandle);
          
          // Inject market variable into variables if not already present
          // Create a new variables object to avoid mutating the original
          const variables = {
            ...options?.variables,
            ...(options?.variables?.market ? {} : {market: marketHandle}),
          };

          // Call the original query method with modified query and variables
          return value.call(target, modifiedQuery, {
            ...options,
            variables,
          });
        };
      }

      // Return other properties as-is
      return value;
    },
  });
}

