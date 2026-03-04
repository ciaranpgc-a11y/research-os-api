# OpenAI Usage Analysis & Free Tier Capacity

## OpenAI Free Tier Limits
- **$5 credit** (expires 3 months after first API use)
- Rate limits: 200 requests/day, 40k tokens/min on free tier

## Current OpenAI Usage in Your Application

### 1. **Affiliation Suggestions** (gpt-4.1-nano)
- **Trigger**: User types in affiliation field
- **Frequency**: ~2-5 times per profile setup/edit
- **Tokens**: ~150 input + 280 output = 430 tokens
- **Cost per call**: ~$0.0002 ($0.20/1M)
- **Optimizations Applied**:
  - ✅ Disabled fallback model
  - ✅ Reduced debounce to 120ms
  - ✅ Max 280 output tokens
  - ✅ Caching enabled

### 2. **Structured Abstracts** (gpt-4.1-mini) 
- **Trigger**: After publication import (one-time per publication)
- **Frequency**: 1x per publication, cached forever
- **Tokens**: ~800 input + 600 output = 1,400 tokens
- **Cost per call**: ~$0.0012 ($0.40 input + $1.60 output per 1M)
- **Optimizations**:
  - ✅ Cached permanently (never recalculated)
  - ✅ Only runs on new publications
  - ✅ Fallback checks PubMed first (free)

### 3. **Publication Metrics** (No OpenAI)
- **Status**: ✅ Pure computation, no AI
- **Cost**: $0
- **TTL**: 7 days (as of latest optimization)

### 4. **Research Overview Suggestions** (gpt-4.1-mini)
- **Trigger**: User-initiated feature
- **Frequency**: Optional, on-demand
- **Tokens**: ~2,000 input + 1,500 output = 3,500 tokens
- **Cost per call**: ~$0.0032
- **Optimizations Applied**:
  - ✅ Fallback disabled by default

### 5. **Manuscript Generation** (gpt-4.1-mini)
- **Trigger**: User creates/edits manuscripts
- **Frequency**: Optional feature, varies by active researchers
- **Tokens**: Variable (500-5,000 per section)
- **Cost**: $0.001 - $0.01 per section generated

## Per-User Cost Breakdown

### Passive User (Browse Only)
- Profile view: $0
- Navigate site: $0
- **Total**: **$0/month**

### Active Researcher (Typical)
- Initial profile setup: 3 affiliation lookups = **$0.0006**
- Import 100 publications: 100 structured abstracts = **$0.12**
- Occasional affiliation edits: 2/month = **$0.0004**
- Research overviews: 1-2/month = **$0.006**
- **Total**: **~$0.13 first month, ~$0.007/month ongoing**

### Heavy User (Writer)
- All of above: **$0.13**
- Manuscript generation: 5 sections = **$0.03**
- Paragraph regeneration: 10 uses = **$0.02**
- **Total**: **~$0.18 first month, ~$0.05/month ongoing**

## Free Tier Capacity Calculations

### Scenario 1: Research-Only Users
**Assumption**: Users import publications, browse metrics
- Cost per user: **$0.13** (one-time) + **$0.007/month**
- **Initial onboarding**: 38 users ($5 / $0.13)
- **Sustainable**: 714 users/month after onboarding ($5 / $0.007)

### Scenario 2: Mixed User Base (80% passive, 20% active)
- 80% passive: $0/user
- 20% active: $0.13 + $0.007/month
- **Initial capacity**: 192 users (38 active, 154 passive)
- **Monthly sustainable**: ~3,570 users (714 active)

### Scenario 3: Heavy Writing Users (Worst Case)
- Cost per user: **$0.18** + **$0.05/month**
- **Initial capacity**: 27 users
- **Monthly sustainable**: 100 users after onboarding

## Recommended User Base Targets (Free Tier)

### Conservative (Safe)
- **25-30 total users**
- Assumes 50% write manuscripts heavily
- $5 lasts 3 months comfortably
- **Best for**: Private beta, research group

### Moderate (Realistic)
- **100-150 total users**
- Assumes 20% heavy users, 30% active researchers, 50% passive
- $5 lasts 2-3 months
- **Best for**: Department-wide pilot

### Aggressive (High-Risk)
- **300-500 total users** 
- Assumes 90% passive viewers, 10% researchers
- $5 lasts 1-2 months depending on manuscript usage
- **Best for**: Public launch with mostly read-only access

## Cost Per Month (Paid Tier)

If you exceed free tier, projected costs:

### 100 Users (Mixed)
- 20 active researchers: 20 × $0.007 = **$0.14/month**
- 5 heavy writers: 5 × $0.05 = **$0.25/month**
- 75 passive: $0
- **Total**: **~$0.39/month** (after initial onboarding)

### 1,000 Users (Mixed)
- 200 active: 200 × $0.007 = **$1.40/month**
- 50 writers: 50 × $0.05 = **$2.50/month**
- 750 passive: $0
- **Total**: **~$3.90/month** (after initial onboarding)

### 10,000 Users (Scale)
- 2,000 active: **$14/month**
- 500 writers: **$25/month**
- 7,500 passive: $0
- **Total**: **~$39/month** (after initial onboarding)

## Optimization Recommendations ALREADY IMPLEMENTED ✅

1. ✅ **Extended metrics cache**: 24h → 7 days (85% reduction)
2. ✅ **Removed sign-in triggers**: No wasteful on-login refreshes
3. ✅ **Affiliation debounce**: 260ms → 120ms (better UX, same cost)
4. ✅ **Disabled AI fallbacks**: Single model attempts only
5. ✅ **Max token limits**: Constrained output sizes
6. ✅ **Proactive metrics**: Compute after import, not on-demand

## Additional Optimizations Available

### Can Be Implemented:
1. **Disable structured abstracts**: Use raw abstracts only (-$0.12/user)
2. **Rate limit manuscript generation**: 10 sections/user/month
3. **Batch affiliation lookups**: Deduplicate common institutions
4. **Cache research overviews**: 30-day TTL per query

### Trade-offs:
- Structured abstracts require disabling a key feature
- Rate limiting may frustrate heavy writers
- Caching reduces personalization

## Monitoring Recommendations

1. **Track daily token usage** via API telemetry service (already implemented)
2. **Set alerts** at 80% of free tier ($4)
3. **Monitor per-feature costs** to identify unexpected usage
4. **Implement user-facing quotas** if scaling beyond free tier

## Bottom Line

**With current optimizations:**
- **Conservative target**: 25-30 users (safe for 3 months)
- **Realistic target**: 100-150 users (safe for 2-3 months)
- **Optimistic target**: 300-500 users (if mostly passive, 1-2 months)

**After free tier:**
- Cost is extremely low (~$0.007/active user/month)
- At 1,000 users: ~$4/month
- At 10,000 users: ~$40/month

**Your site is exceptionally cost-efficient** thanks to:
- Aggressive caching
- One-time computations (abstracts)
- 7-day metrics TTL
- Disabled wasteful triggers
- No AI in core navigation/metrics
