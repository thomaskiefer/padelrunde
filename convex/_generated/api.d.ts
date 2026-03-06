/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as groups from "../groups.js";
import type * as helpers from "../helpers.js";
import type * as http from "../http.js";
import type * as matches from "../matches.js";
import type * as model_groupMembership from "../model/groupMembership.js";
import type * as model_history from "../model/history.js";
import type * as model_knockout from "../model/knockout.js";
import type * as model_pairings from "../model/pairings.js";
import type * as model_slug from "../model/slug.js";
import type * as model_standings from "../model/standings.js";
import type * as model_stats from "../model/stats.js";
import type * as model_validation from "../model/validation.js";
import type * as rounds from "../rounds.js";
import type * as standings from "../standings.js";
import type * as stats from "../stats.js";
import type * as tournaments from "../tournaments.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  groups: typeof groups;
  helpers: typeof helpers;
  http: typeof http;
  matches: typeof matches;
  "model/groupMembership": typeof model_groupMembership;
  "model/history": typeof model_history;
  "model/knockout": typeof model_knockout;
  "model/pairings": typeof model_pairings;
  "model/slug": typeof model_slug;
  "model/standings": typeof model_standings;
  "model/stats": typeof model_stats;
  "model/validation": typeof model_validation;
  rounds: typeof rounds;
  standings: typeof standings;
  stats: typeof stats;
  tournaments: typeof tournaments;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
