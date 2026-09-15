import type { ISecurityAgentCollector } from './types.js'
import { ZscalerCollector } from './collectors/zscaler.collector.js'
import { CrowdStrikeCollector } from './collectors/crowdstrike.collector.js'

// Add a new vendor by implementing ISecurityAgentCollector and appending it
// here — no other file in this module (or the rest of the app) changes.
export const securityAgentCollectors: ISecurityAgentCollector[] = [
  new ZscalerCollector(),
  new CrowdStrikeCollector(),
]
