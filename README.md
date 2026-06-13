# jobscanner

Auto-updated job feed from a curated company watchlist. Re-scanned every 2 hours.

**Last scan:** 2026-06-13T19:01:19.982Z
**Active roles:** 50 of 251 across 18 companies

> Set up: copy `.env.example` to `.env`, install the cron entry from `scripts/cron.example`, then `./scripts/run-scan.sh` runs the scan and pushes to `main`.

## Data & site

Scanning runs **locally** (cron / launchd on the owner's machines — no GitHub Actions). The repo is a mostly read-only data publication:

```
local scan  ->  data/jobs.json (current scan, canonical — career-ops ingests this)
            ->  data/jobs-all.json (append-only history)
            ->  docs/data/jobs.parquet  (+ docs/data/meta.json)   [scripts/export-parquet.mjs]
            ->  GitHub Pages (docs/, branch main)  ->  jobscanner.surdi.in
```

- **`data/jobs.json` is the canonical scanner output and contract** — it is never reshaped by the publish step. Parquet is purely additive.
- The Parquet export (`npm run export`) reads the full history (`data/jobs-all.json`), sorts by `last_seen_at` desc, and writes a columnar file the viewer reads **selectively over HTTP range requests** — it does not download a giant JSON. It runs automatically at the end of `scripts/run-scan.sh`.
- The viewer at [jobscanner.surdi.in](https://jobscanner.surdi.in) (`docs/index.html`) loads `docs/data/jobs.parquet` from the same origin using a vendored [hyparquet](https://github.com/hyparam/hyparquet) reader (`docs/vendor/`, no CDN, no build step) and pages through it by row group. GitHub Pages serves byte ranges; on hosts that don't, the reader falls back to a single full-file fetch.

## Latest jobs

### Airbyte

- [Senior Integrations Engineer (API Sources & Automation)](https://jobs.ashbyhq.com/airbyte/cf6a373c-1649-45f0-857d-4974b1c25005) — San Francisco — posted 2026-06-03

### Baseten

- [Software Engineer - Capacity](https://jobs.ashbyhq.com/baseten/902a7ddb-c21f-4272-aaab-879680697986) — San Francisco — posted 2026-06-12

### Brex

- [Senior Application Security Engineer (Remote)](https://www.brex.com/careers/8590025002?gh_jid=8590025002) — United States — posted 2026-06-12

### Cerebras

- [Senior Front End Design Engineer (Microarchitecture)](https://job-boards.greenhouse.io/cerebrassystems/jobs/7763907003) — Sunnyvale, CA — posted 2026-06-04

### Confluent

- [Senior Software Engineer](https://jobs.ashbyhq.com/confluent/905efbaa-d814-4b16-a377-d417c7d3d772) — *Job Posting Only: USA1 — posted 2026-06-03
- [Senior Software Engineer - Infrastructure](https://jobs.ashbyhq.com/confluent/4218f1c2-3679-4aff-a458-20ef09817fc4) — CA Remote Ontario — posted 2026-06-03

### CoreWeave

- [Senior Production Engineer (Reliability)](https://coreweave.com/careers/job?4689092006&board=coreweave&gh_jid=4689092006) — Livingston, NJ / New York, NY / Sunnyvale, CA / San Francisco, CA / Bellevue, WA — posted 2026-06-12
- [Senior Software Engineer, Applied AI](https://coreweave.com/careers/job?4688538006&board=coreweave&gh_jid=4688538006) — New York, NY / Sunnyvale, CA / Bellevue, WA — posted 2026-06-11
- [Senior Specialist Field Engineer - Compute Infrastructure](https://coreweave.com/careers/job?4688589006&board=coreweave&gh_jid=4688589006) — Livingston, NJ / New York, NY / Sunnyvale, CA / San Francisco, CA / Bellevue, WA / Dallas, TX — posted 2026-06-11
- [Senior Engineer, Storage Control Plane](https://coreweave.com/careers/job?4688327006&board=coreweave&gh_jid=4688327006) — Livingston, NJ / New York, NY / Sunnyvale, CA / Bellevue, WA  — posted 2026-06-10
- [Senior Software Engineer, Product](https://coreweave.com/careers/job?4687426006&board=coreweave&gh_jid=4687426006) — New York, NY / Sunnyvale, CA / San Francisco, CA / Bellevue, WA — posted 2026-06-05
- [Senior Security Engineer II, Cloud Security](https://coreweave.com/careers/job?4686324006&board=coreweave&gh_jid=4686324006) — Livingston, NJ / New York, NY / Sunnyvale, CA / Bellevue, WA — posted 2026-06-04

### Datadog

- [Senior Services Architect - New York](https://careers.datadoghq.com/detail/7996907/?gh_jid=7996907) — New York, New York, USA — posted 2026-06-12
- [Senior Software Engineer - Observability Visibility](https://careers.datadoghq.com/detail/8001760/?gh_jid=8001760) — New York, New York, USA — posted 2026-06-12
- [Senior Software Engineer - Code Gen](https://careers.datadoghq.com/detail/7993198/?gh_jid=7993198) — New York, New York, USA — posted 2026-06-10
- [Senior Developer Advocate - Modern App Development](https://careers.datadoghq.com/detail/7985840/?gh_jid=7985840) — California, USA, Remote; Nevada, USA, Remote; Texas, USA, Remote; Washington, USA, Remote — posted 2026-06-05
- [Senior Software Engineer - Linux Kernel/eBPF](https://careers.datadoghq.com/detail/7983548/?gh_jid=7983548) — New York, New York, USA — posted 2026-06-04

### Decagon

- [Platform Engineer, Security](https://jobs.ashbyhq.com/decagon/3a68de82-c874-4cd2-b639-17948748e212) — San Francisco — posted 2026-06-05
- [Senior Platform Engineer, Security](https://jobs.ashbyhq.com/decagon/59330f7d-3489-40c1-bff1-60e95d56b112) — San Francisco — posted 2026-06-05

### Mercury

- [Senior People Operations Specialist](https://job-boards.greenhouse.io/mercury/jobs/6017266004) — San Francisco, CA, New York, NY, Portland, OR, or Remote within Canada or United States — posted 2026-06-09
- [Senior Risk Strategist - Fraud](https://job-boards.greenhouse.io/mercury/jobs/6013670004) — San Francisco, CA, New York, NY, Portland, OR, or Remote within Canada or United States — posted 2026-06-04

### Nuro

- [Software Engineer, Onboard Infrastructure](https://nuro.ai/careersitem?gh_jid=7998328) — Mountain View, California (HQ) — posted 2026-06-10
- [Staff/Senior Software Engineer, Onboard Infrastructure](https://nuro.ai/careersitem?gh_jid=7998327) — Mountain View, California (HQ) — posted 2026-06-10

### Perplexity

- [Member of Technical Staff (Software Engineer, Agent Capabilities)](https://jobs.ashbyhq.com/perplexity/7f2b3619-5ffa-467b-be6f-7a6b7d487892) — San Francisco — posted 2026-06-13
- [Member of Technical Staff (AI Software Engineer, Agents)](https://jobs.ashbyhq.com/perplexity/4ab39122-1d15-4874-8ab7-c6a241472743) — San Francisco — posted 2026-06-12
- [Member of Technical Staff (Software Engineer, API Platform)](https://jobs.ashbyhq.com/perplexity/3f800e42-7c48-4f9a-9b12-43ee23e52516) — San Francisco — posted 2026-06-11
- [Member of Technical Staff (Engineering Lead, Developer Experience)](https://jobs.ashbyhq.com/perplexity/e8bb72ad-4867-4a68-b6cf-f22a370237f2) — San Francisco — posted 2026-06-11
- [Member of Technical Staff (ML Engineer, Recommendations & User Modeling)](https://jobs.ashbyhq.com/perplexity/affd3040-91e4-4e0c-bd2f-4b022c613f91) — San Francisco — posted 2026-06-06
- [Member of Technical Staff (AI Software Engineer, Multimodal)](https://jobs.ashbyhq.com/perplexity/6e328b72-9f57-49e0-a1a8-4428abf8ff81) — San Francisco — posted 2026-06-06
- [Member of Technical Staff (AI Software Engineer, Agents)](https://jobs.ashbyhq.com/perplexity/8fd01227-a933-4319-a281-fa6e3ce8d8ca) — San Francisco — posted 2026-06-06
- [Member of Technical Staff (Software Engineer, Computer Growth)](https://jobs.ashbyhq.com/perplexity/e7ab0be5-68ba-4a2c-abb1-ee33886d955d) — San Francisco — posted 2026-06-04

### Replit

- [Product Engineer, Product Platform (Frontend)](https://jobs.ashbyhq.com/replit/657a90d2-23cc-4c86-b9ed-a21900efee0d) — Foster City, CA — posted 2026-06-12
- [Senior Talent Programs Lead](https://jobs.ashbyhq.com/replit/07a2d8e2-acba-411a-9601-9d424d2059dc) — Foster City, CA — posted 2026-06-04

### Robinhood

- [Senior Web Engineer, Legend](https://boards.greenhouse.io/robinhood/jobs/7847004?t=gh_src=&gh_jid=7847004) — Menlo Park, CA; New York, NY — posted 2026-06-10

### Sierra

- [Software Engineer, Voice](https://jobs.ashbyhq.com/sierra/032c8ab4-1911-4477-bc39-9cfcd701d5a9) — San Francisco, CA — posted 2026-06-05
- [Software Engineer, Insights](https://jobs.ashbyhq.com/sierra/8cca0a0d-7359-410b-81ed-331a0bb4667f) — San Francisco, CA — posted 2026-06-05
- [Software Engineer, Agent Builder](https://jobs.ashbyhq.com/sierra/9b70b937-9634-4bcd-a10e-2671145f3a07) — San Francisco, CA — posted 2026-06-05
- [Software Engineer, Product](https://jobs.ashbyhq.com/sierra/5ae78769-a3a1-491c-8b4b-95472f1fb36c) — San Francisco, CA — posted 2026-06-05
- [Software Engineer, Infrastructure](https://jobs.ashbyhq.com/sierra/802d17c5-fe47-4b44-90e5-65e5e731ff88) — San Francisco, CA — posted 2026-06-05
- [Software Engineer, Agent Data Platform](https://jobs.ashbyhq.com/sierra/78c5dce4-3670-4c9b-a666-98f435c56324) — San Francisco, CA — posted 2026-06-05

### Stripe

- [Account Executive, Platforms, Grower](https://stripe.com/jobs/search?gh_jid=7965001) — San Francisco, CA — posted 2026-06-11
- [Account Executive, Enterprise Platforms, Hunter](https://stripe.com/jobs/search?gh_jid=7961609) — New York, NY; San Francisco, CA; Seattle, WA; Los Angeles, CA; Denver, CO; Austin, TX; US-West Remote — posted 2026-06-11

### Twilio

- [Senior Strategic Account Executive](https://job-boards.greenhouse.io/twilio/jobs/8000760) — Remote - US — posted 2026-06-12
- [Senior Strategic Account Executive](https://job-boards.greenhouse.io/twilio/jobs/8004114) — Remote - US — posted 2026-06-12
- [Senior Strategic Account Executive](https://job-boards.greenhouse.io/twilio/jobs/8003867) — Remote - US — posted 2026-06-12
- [Software Engineer (L3)](https://job-boards.greenhouse.io/twilio/jobs/7996779) — Remote - India — posted 2026-06-12

### Vapi

- [Member of Technical Staff,  Core Backend](https://jobs.ashbyhq.com/vapi/941f5562-52f1-43f0-92d4-9d05931c0955) — San Francisco — posted 2026-06-11
- [Member of Technical Staff, DevOps](https://jobs.ashbyhq.com/vapi/2d702840-a588-4273-8b98-49ed815c0c50) — San Francisco — posted 2026-06-03
- [Member of Technical Staff, Site Reliablity Engineer](https://jobs.ashbyhq.com/vapi/4b6abd59-ac74-40e9-8cab-74253078aaf4) — San Francisco — posted 2026-06-03

### Writer

- [Software engineer, connectors & MCP](https://jobs.ashbyhq.com/writer/26f309e7-04eb-4467-b201-b0a909b9524e) — San Francisco, CA — posted 2026-06-03

---

_Generated by `skills/jobscan` — see `CLAUDE.md` for how this works._
