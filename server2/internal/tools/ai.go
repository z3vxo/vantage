package tools

import (
	"context"
	"fmt"
	"os"
	"strings"

	"github.com/anthropics/anthropic-sdk-go"
	"github.com/anthropics/anthropic-sdk-go/option"
	"github.com/z3vxo/recon-dashboard/internal/database"
)

const systemPrompt = `You are a bug bounty reconnaissance triage assistant. Your job is to classify domains into priority tiers based on their URL, page title, and tech stack.

Tier 1 — Test now: Authentication pages, admin panels, dashboards, internal tooling, API gateways, known high-value tech (Jenkins, Jira, Confluence, GitLab, Kibana, Grafana, phpMyAdmin, cPanel, Kubernetes, Elasticsearch), login portals, staging/dev environments, file upload endpoints, internal line-of-business apps, portals handling sensitive data (grants, research, licensing, compliance, health records, case management), ASP.NET or Azure apps with a business function, Power BI dashboards, any app that processes form submissions or user data, CMS backends (Drupal, WordPress admin), learning management systems (Moodle etc), any subdomain with dev/staging/master/test/uat in the name.

Tier 2 — Test later: Generic public-facing web apps with no obvious auth or data handling, marketing sites with some backend tech indicators, informational portals that may have hidden functionality, WordPress or Drupal front-ends without visible admin access, subdomains that need more enumeration to assess.

Tier 3 — Don't bother: Parked domains, CDN/static asset hosts, empty pages, 503/404 with no content, pure marketing or brochure sites, documentation sites, status pages, clearly out-of-scope infrastructure, Cloudflare-blocked with no bypass indicators.

Rules:
- When in doubt between tiers, go higher.
- A login page alone is tier 1 regardless of tech.
- Any internal tooling, portal, or line-of-business app is tier 1 by default.
- Power BI, ASP.NET, Azure apps with a business function are tier 1.
- Research, grants, licensing, and data submission portals are tier 1.
- 401/403 on a sensitive-looking subdomain is still tier 1 — auth bypass is worth trying.
- Unknown or missing tech stack is not a reason to downgrade.
- Reasons must be 5 words or fewer.
- Output only valid JSON, no commentary, no markdown.

Output format:
{"tier1":[{"domain":"example.com","reason":"Jenkins login panel"}],"tier2":[{"domain":"example2.com","reason":"generic app, unclear surface"}],"tier3":[{"domain":"example3.com","reason":"parked domain"}]}`

func AnalyiseDomains(domain string) error {

	domains, err := database.ReadHostsForAI(domain)
	if err != nil {
		fmt.Println("error1")
		return err
	}
	fmt.Println("Anylising domains")

	for i := 0; i < len(domains); i += 50 {
		end := i + 50
		if end > len(domains) {
			end = len(domains)
		}
		batch := domains[i:end]
		if err := AnlyiseBatch(batch); err != nil {
			fmt.Println("batch error:", err)
		}
	}

	return nil
}

func AnlyiseBatch(batch []database.DomainForAI) error {
	var sb strings.Builder
	for _, d := range batch {
		fmt.Fprintf(&sb, "%s | %s | %s | %s\n", d.URL, d.Status, d.Title, d.Tech)
	}
	client := anthropic.NewClient(
		option.WithAPIKey(os.Getenv("ANTHROPIC_API_KEY")),
	)

	message, err := client.Messages.New(context.Background(),
		anthropic.MessageNewParams{
			Model:     anthropic.ModelClaudeHaiku4_5_20251001,
			MaxTokens: 2048,
			System:    []anthropic.TextBlockParam{{Text: systemPrompt}},
			Messages: []anthropic.MessageParam{
				anthropic.NewUserMessage(anthropic.NewTextBlock(sb.String())),
			},
		})

	if err != nil {
		return err
	}

	raw := message.Content[0].Text
	raw = stripMarkdown(raw)
	fmt.Println(raw)

	return nil
}

func stripMarkdown(s string) string {
	s = strings.TrimSpace(s)
	if strings.HasPrefix(s, "```") {
		s = s[strings.Index(s, "\n")+1:]
	}
	if strings.HasSuffix(s, "```") {
		s = s[:strings.LastIndex(s, "```")]
	}
	return strings.TrimSpace(s)
}
