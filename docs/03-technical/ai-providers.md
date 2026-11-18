# AI provider audit

Checked **18 Nov 2026 UTC**, against live official documentation; initial research was on 17 Nov. Free availability is not a service guarantee. Account dashboards and response headers override public tables. Keys remain inside the server/evaluation process and are never printed. The initial research did not inspect environment files; the owner later authorized private local credential synchronization and live evaluation. One account per provider; quotas are never multiplied by creating accounts or keys.

## Confirmed free API options

| Provider / model selected | RPM / RPD | TPM / TPD | Reset and eligibility |
| --- | --- | --- | --- |
| Groq: `openai/gpt-oss-20b`, `openai/gpt-oss-120b` | 30 / 1,000 per model | 8,000 / 200,000 | Organization limits; use returned reset durations. Do not assume UTC daily reset without a header. Conservatively count one 200,000 token pool in capacity estimates. |
| Cloudflare Workers AI: Llama 3.1 8B FP8 fast; Llama 3.3 70B FP8 fast | 300 text generation RPM; no separate published RPD | No universal TPM/TPD; **10,000 neurons/day shared by both models** | **00:00 UTC**. Use Workers Free: exceeding allocation fails rather than buying usage. |
| OpenRouter: `openrouter/free` | 20 / **50** without a credit purchase | No universal published token quota | Free model daily quota uses UTC days. A lifetime purchase of at least $10 raises RPD to 1,000, but is excluded from this plan without investment. Negative balances can block even free models. |
| Google Gemini: `gemini-3.1-flash-lite` | Specific to the account/project, shown in AI Studio | Specific to the account; TPM measures input; thinking counts toward output allowance | Daily reset at **midnight America/Los_Angeles**, including DST. Conditional use only: unpaid service terms and age/region restrictions need to suit the deployment. |
| SambaNova: `Meta-Llama-3.3-70B-Instruct` | **20 / 20** | TPM not published / **200,000** | Free account without payment method. Use `x-ratelimit-reset-requests` and `...-requests-day`; no universal daily timezone promise in the table. |
| Vercel AI Gateway: `reflection/beam-free` | Depends on account/model; no universal numeric caps published | No universal numeric token caps published | Current launch promotion is free; **the `-free` suffix stops serving when the offer ends**, rather than silently becoming paid. Separately, unpaid accounts get $5/month for eligible models; do not count that as daily replenishing cash. |

Sources: [Groq limits](https://console.groq.com/docs/rate-limits), [Cloudflare prices and neuron rates](https://developers.cloudflare.com/workers-ai/platform/pricing/), [Cloudflare request limits](https://developers.cloudflare.com/workers-ai/platform/limits/), [OpenRouter limits](https://openrouter.ai/docs/api_reference/limits.md), [Gemini pricing](https://aistudio.google.com/docs/pricing), [Gemini quotas](https://aistudio.google.com/docs/rate-limits), [SambaNova limits](https://docs.sambanova.ai/docs/en/models/rate-limits), [Vercel pricing](https://vercel.com/docs/ai-gateway/pricing), [Beam free promotion](https://vercel.com/changelog/reflection-ai-beam-now-available-on-ai-gateway-for-free).

OpenRouter paid model calls use purchased credits and model/provider prices rather than the free model daily allowance. Credit caps, configured budgets, account balance and provider capacity can all reject a paid call; there is no universal paid TPM/TPD table for this chain. No credit purchase or paid route is configured. The optional historical purchase entitlement above only changes the free model request cap. See [credit and budget limits](https://openrouter.ai/docs/api_reference/limits.md).

## Verified account availability

The public free entitlement and this account's usable access are separate. Five configured models completed all 210 benchmark cases: both Groq models, both Cloudflare models and Gemini. SambaNova stopped with 402 and Vercel with 403, so neither contributes measured launch capacity. OpenRouter's metadata confirmed 50 refreshed requests on 18 Nov after the UTC reset; that allowance has now been used, giving 100 cumulative cases. It remains incomplete until all 210 cases are sampled and can resume after the next UTC reset. See the [dated measurements and capacity calculations](ai-model-ranking.md). No raw upstream error text is retained.

## OpenAI compatible addresses

| Provider | Base URL (adapter appends `/chat/completions`) |
| --- | --- |
| Groq | `https://api.groq.com/openai/v1` |
| Cloudflare | `https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1` |
| OpenRouter | `https://openrouter.ai/api/v1` |
| Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` |
| SambaNova | `https://api.sambanova.ai/v1` |
| Vercel | `https://ai-gateway.vercel.sh/v1` |

Official compatibility references: [Groq](https://console.groq.com/docs/openai), [Cloudflare](https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/), [OpenRouter](https://openrouter.ai/docs/quickstart), [Gemini](https://aistudio.google.com/docs/openai), [SambaNova](https://docs.sambanova.ai/docs/en/get-started/api-keys-urls), [Vercel](https://vercel.com/docs/ai-gateway/sdks-and-apis).

## Data, retention and training

- **Groq:** inference content is not retained by default; reliability/abuse exceptions can retain it up to 30 days. All customers can enable zero data retention. Usage metadata remains. Retention controls alone are not a blanket contractual training guarantee; the current agreement does not expressly promise no training. [Your data](https://console.groq.com/docs/your-data), [services agreement](https://console.groq.com/docs/legal/services-agreement).
- **Cloudflare:** standard inference inputs and outputs are not used to train models, and are processed without persistence, subject to documented exceptions such as abuse/legal obligations and explicitly stateful features. This implementation uses plain inference. [Data usage](https://developers.cloudflare.com/workers-ai/platform/data-usage/).
- **OpenRouter:** upstream storage/training terms vary. Only board/event data is sent. Optional `AI_OPENROUTER_REQUIRE_ZDR` denies collection and requires zero retention; free route availability can disappear under that filter, and current plan pricing restricts routing by data policy. Account logging settings remain the operator's responsibility. [Official data controls](https://openrouter.ai/docs/guides/get-started/sovereign-ai), [current plan eligibility](https://openrouter.ai/pricing).
- **Gemini unpaid:** inputs/outputs can be used to improve products, including training and human review. Paid service terms differ. The terms restrict API clients for people under 18 and require paid services in some regions; therefore a key alone does not enable Gemini in this public game. [Terms](https://aistudio.google.com/docs/terms).
- **SambaNova:** its DPA prohibits training on customer personal data and on derived deidentified data. This is not a claim that every free account has contractual ZDR; retention and applicable cloud terms still require review. Only synthetic board/event information is submitted. [DPA](https://sambanova.ai/data-processing-agreement-sambanova).
- **Vercel:** AI Gateway terms prohibit Vercel training/improvement using gateway customer content; upstream model terms still apply. Beam's model page links Reflection's own terms/privacy; do not assume ZDR or an upstream training prohibition merely from the gateway's promise. [Gateway terms](https://vercel.com/legal/ai-product-terms), [Beam model terms links](https://vercel.com/ai-gateway/models/beam-free).

## Investigated, excluded from the recurring free launch chain

| Provider | Current evidence and reason |
| --- | --- |
| Cerebras | Current pricing is **$5 Free Trial**, not confirmed recurring free allocation. Trial GPT OSS 120B: 5 RPM, 30k uncached TPM, 90k total TPM, 1M TPD; rolling token buckets, no separate published RPD. OpenAI compatible API exists at `https://api.cerebras.ai/v1`. Trial credit is excluded from sustainable daily capacity. [Limits](https://inference-docs.cerebras.ai/support/rate-limits), [pricing](https://www.cerebras.ai/pricing). Its [privacy policy](https://www.cerebras.ai/privacy-policy) says inference inputs/outputs are not retained, while service logs are deleted when no longer needed; it is not an express blanket training guarantee. |
| OpenCode | Free models require the OpenCode client. External clients require a paid/Go entitlement. The compatible base is `https://opencode.ai/inference/openai/v1`, but no confirmed free API entitlement for this game. No client impersonation. LongCat's current free offer has 100 RPD; universal RPM/TPM/TPD and reset times are not published. Retention/training vary by model: some free offers retain/use data for improvement; others promise no retention/training. [Current model documentation and privacy](https://opencode.ai/docs/console/models/). |
| Hugging Face | Current inference credit for free users is **None**; older $0.10/month advice is stale. [Pricing](https://huggingface.co/docs/inference-providers/en/pricing). |
| Mistral | Current usage/billing documentation says Free mode does **not** include API access and API keys require billing activation, despite older contradictory help pages. No confirmed free deployment entitlement today. [Current usage limits](https://docs.mistral.ai/admin/billing-usage/usage-limits). |

## Capacity methodology

The repeatable evaluator measures this project's actual prompts and replies, including reasoning tokens reported by providers, and writes the capacity calculation into `ai-model-ranking.md`. Missing credentials produce an explicit unmeasured report, never invented token counts or quality scores.

For a clearly stated benchmark of 30 AI moves/game, a provider covers `floor(min(RPD, floor(TPD / mean_total_tokens)) / 30)` games/day with model assistance. Cloudflare uses `input_tokens * input_neurons_per_million / 1e6 + output_tokens_including_thinking * output_neurons_per_million / 1e6` instead. The 8B model costs 4,119 input and 34,868 output neurons/million; the 70B model costs 26,668 and 204,805. Both share the same 10,000 daily pool. Standalone taunts add calls; idle chatter has no fixed maximum per game, so there is no honest unconditional games/day guarantee. Cached/local lines consume no quota.

Capacity with models is separate from playability: engine fallback has no external AI quota and continues after the whole chain is exhausted. Public API allowances may change, and evaluated failures consume quota too. The evaluator records incomplete providers when rate limited instead of exhausting retries or treating partial samples as a complete ranking.
