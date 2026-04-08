package tools

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/z3vxo/vantage/internal/database"
)

var (
	activeJobs   = map[string]bool{}
	activeJobsMu sync.Mutex
)

func isRunning(domain string) bool {
	activeJobsMu.Lock()
	defer activeJobsMu.Unlock()
	return activeJobs[domain]
}

func setRunning(domain string, v bool) {
	activeJobsMu.Lock()
	defer activeJobsMu.Unlock()
	activeJobs[domain] = v
}

func SendTelegram(msg string) {
	token := os.Getenv("TELEGRAM_BOT_TOKEN")
	chatID := os.Getenv("TELEGRAM_CHAT_ID")
	url := fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage",
		token)
	http.PostForm(url, map[string][]string{
		"chat_id":    {chatID},
		"text":       {msg},
		"parse_mode": {"HTML"},
	})
}

type TelegramUpdate struct {
	UpdateID int `json:"update_id"`
	Message  struct {
		Text string `json:"text"`
		Chat struct {
			ID int64 `json:"id"`
		} `json:"chat"`
	} `json:"message"`
}

type TelegramResponse struct {
	OK     bool             `json:"ok"`
	Result []TelegramUpdate `json:"result"`
}

func GetUpdateReq(offset int) (TelegramResponse, error) {

	token := os.Getenv("TELEGRAM_BOT_TOKEN")

	var Response TelegramResponse
	resp, err := http.Get(fmt.Sprintf("https://api.telegram.org/bot%s/getUpdates?offset=%d", token, offset))
	if err != nil {
		return TelegramResponse{}, err
	}
	defer resp.Body.Close()

	if err := json.NewDecoder(resp.Body).Decode(&Response); err != nil {
		return TelegramResponse{}, err
	}

	return Response, nil

}

const (
	CMD_UNKNOWN = 0
	CMD_START   = 1
	CMD_TARGETS = 2
	CMD_INFO    = 3
	CMD_DOMAINS = 4
	CMD_JS      = 5
)

func CheckCommandType(message string) int {
	if strings.HasPrefix(message, "/start") {
		return CMD_START
	} else if strings.HasPrefix(message, "/targets") {
		return CMD_TARGETS
	} else if strings.HasPrefix(message, "/info") {
		return CMD_INFO
	} else if strings.HasPrefix(message, "/domains") {
		return CMD_DOMAINS
	} else if strings.HasPrefix(message, "/js") {
		return CMD_JS
	}
	return CMD_UNKNOWN
}

func ListTargets() {
	entries, err := os.ReadDir(database.DbDir())
	if err != nil {
		SendTelegram("[!] Failed to read targets")
		return
	}

	var targets []string
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), "_db.sql") {
			targets = append(targets, strings.TrimSuffix(entry.Name(), "_db.sql"))
		}
	}

	if len(targets) == 0 {
		SendTelegram("[*] No targets found")
		return
	}

	msg := "[*] Targets:\n"
	for _, t := range targets {
		msg += "[+] <u>" + t + "</u>\n"
	}
	SendTelegram(msg)
}

func ListDomains(target string) {
	names, err := database.GetDomainNames(target)
	if err != nil {
		SendTelegram(fmt.Sprintf("[!] Failed to read domains — %s", target))
		return
	}
	if len(names) == 0 {
		SendTelegram(fmt.Sprintf("[*] No domains found for %s", target))
		return
	}

	const chunkSize = 15
	for i := 0; i < len(names); i += chunkSize {
		end := i + chunkSize
		if end > len(names) {
			end = len(names)
		}
		chunk := names[i:end]
		msg := fmt.Sprintf("[*] Domains (%d-%d / %d):\n", i+1, end, len(names))
		for _, e := range chunk {
			msg += fmt.Sprintf("<u>%s</u> %s\n", e.Name, e.StatusCode)
		}
		SendTelegram(msg)
	}
}

func ListInfo(domain string) {
	stats, err := database.GetStats(domain)
	if err != nil {
		SendTelegram(fmt.Sprintf("[!] Failed Getting stats — %s", domain))
		return
	}

	msg := fmt.Sprintf(
		"[*] Info — %s\n\n[+] Hosts: %d\n🟢 2xx: %d\n🟡 4xx: %d\n🔴 5xx: %d\n[+] Endpoint hits: %d",
		domain, stats.Total, stats.S2xx, stats.S4xx, stats.S5xx, stats.Hits,
	)
	SendTelegram(msg)
}

func StartTeleGramBot() {
	fmt.Println("[*] Telegram bot started, ensure api key and chat ID are in envs")
	chatIDstr := os.Getenv("TELEGRAM_CHAT_ID")
	chatID, _ := strconv.ParseInt(chatIDstr, 10, 64)
	offset := 0
	for {
		Response, err := GetUpdateReq(offset)
		if err != nil {
			continue
		}

		for _, r := range Response.Result {
			if r.Message.Chat.ID != chatID {
				continue
			}
			switch CheckCommandType(r.Message.Text) {
			case CMD_START:
				domain := strings.TrimSpace(strings.TrimPrefix(r.Message.Text, "/start"))
				if domain == "" {
					SendTelegram("[!] Error: domain must be present\n/start <domain>")
					continue
				}
				go RunWorkFlow(domain)
			case CMD_TARGETS:
				go ListTargets()
			case CMD_INFO:
				domain := strings.TrimSpace(strings.TrimPrefix(r.Message.Text, "/info"))
				if domain == "" {
					SendTelegram("[!] Error: domain must be present\n/info <domain>")
					continue
				}
				go ListInfo(domain)
			case CMD_DOMAINS:
				target := strings.TrimSpace(strings.TrimPrefix(r.Message.Text, "/domains"))
				if target == "" {
					SendTelegram("[!] Error: target must be present\n/domains <target>")
					continue
				}
				go ListDomains(target)
				// case CMD_JS:
				// 	target := strings.TrimSpace(strings.TrimPrefix(r.Message.Text, "/js"))
				// 	if target == "" {
				// 		SendTelegram("[!] Error: target must be present\n/js <target>")
				// 		continue
				// 	}
				// 	go RunJs(target)
			}
		}
		if len(Response.Result) > 0 {
			offset = Response.Result[len(Response.Result)-1].UpdateID + 1
		}
		time.Sleep(2 * time.Second)
	}
}

// func RunJs(target string) {
// 	if isRunning(target) {
// 		SendTelegram("[!] Recon Already Running for " + target)
// 		return
// 	}
// 	setRunning(target, true)
// 	defer setRunning(target, false)
// 	SendTelegram(fmt.Sprintf("[*] Starting JS — %s", target))

// 	ScrapeAndScan(target)
// }

func RunWorkFlow(baseDomain string) {

	if isRunning(baseDomain) {
		SendTelegram("[!] Recon Already Running for " + baseDomain)
		return
	}
	setRunning(baseDomain, true)
	defer setRunning(baseDomain, false)
	SendTelegram(fmt.Sprintf("[*] Starting recon — %s", baseDomain))

	cmd := exec.Command("./recon.sh", baseDomain)
	cmd.Dir = ".."
	out, err := cmd.CombinedOutput()
	if err != nil {
		SendTelegram(fmt.Sprintf("[!] Recon failed — %s\n%s", baseDomain, string(out)))
		return
	}

	// create DB, ignore error if it already exists
	if err = database.CreateNewTarget(baseDomain); err != nil && err != database.ErrDomainExists {
		SendTelegram(fmt.Sprintf("[!] Failed creating database — %s", baseDomain))
		return
	}

	if err = database.ImportData(baseDomain); err != nil {
		SendTelegram(fmt.Sprintf("[!] Failed ingesting data — %s", baseDomain))
		return
	}

	stats, err := database.GetStats(baseDomain)
	if err != nil {
		SendTelegram(fmt.Sprintf("[*] Recon done — %s (stats unavailable)", baseDomain))
		return
	}

	msg := fmt.Sprintf(
		"[*] Recon Done — %s\n\n[+] Hosts: %d\n🟢 2xx: %d\n🟡 4xx: %d\n🔴 5xx: %d\n[+] Endpoint hits: %d",
		baseDomain, stats.Total, stats.S2xx, stats.S4xx, stats.S5xx, stats.Hits,
	)
	SendTelegram(msg)
}
