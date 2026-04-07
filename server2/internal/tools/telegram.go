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

	"github.com/z3vxo/recon-dashboard/internal/database"
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
		"chat_id": {chatID},
		"text":    {msg},
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
)

func CheckCommandType(message string) int {
	if strings.HasPrefix(message, "/start") {
		return CMD_START
	} else if strings.HasPrefix(message, "/targets") {
		return CMD_TARGETS
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
		msg += "[+] " + t + "\n"
	}
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
			}
		}
		if len(Response.Result) > 0 {
			offset = Response.Result[len(Response.Result)-1].UpdateID + 1
		}
		time.Sleep(2 * time.Second)
	}
}

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
		"[*] Recon Done — %s\n\n[+] Hosts: %d\n[+] 2xx: %d | 4xx: %d | 5xx: %d\n[+] Endpoint hits: %d",
		baseDomain, stats.Total, stats.S2xx, stats.S4xx, stats.S5xx, stats.Hits,
	)
	SendTelegram(msg)
}
