package tools

import (
	"fmt"
	"net/http"
	"os"
	"os/exec"

	"github.com/z3vxo/recon-dashboard/internal/database"
)

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

func RunWorkFlow(baseDomain string) {

	str := fmt.Sprintf("[*] Starting recon workflow on %s", baseDomain)
	SendTelegram(str)

	cmd := exec.Command("./recon.sh", baseDomain)
	cmd.Dir = ".."
	_, err := cmd.CombinedOutput()
	if err != nil {
		str := fmt.Sprintf("Failed Running recon pipeline: %s", err)
		SendTelegram(str)
	}

	if err = database.CreateNewTarget(baseDomain); err != nil {
		SendTelegram("[!] Failed Creating Database for target")
	}

	if err = database.ImportData(baseDomain); err != nil {
		SendTelegram("[!] Failed ingesting for target")
	}

	stats, err := database.GetStats(baseDomain)
	if err != nil {
		SendTelegram(fmt.Sprintf("✅ recon done for %s (stats unavailable)", baseDomain))
		return
	}
	msg := fmt.Sprintf("[*] Recon Done for %s\n---STATS---\n[+] Total Hosts %d\n[+] 2xx: %d\n[+] 4xx: %d\n[+] 5xx: %d\n[+] Endpoint hits: %d\n",
		baseDomain, stats.Total, stats.S2xx, stats.S4xx, stats.S5xx, stats.Hits)
	SendTelegram(msg)

}
