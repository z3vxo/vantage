package tools

import (
	"fmt"
	"net/http"
	"os"
	"os/exec"
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
	cmd := exec.Command("../recon.sh", baseDomain)
	cmd.Dir = ".."
	out, err := cmd.CombinedOutput()
	if err != nil {
		str := fmt.Sprintf("Failed Running recon pipeline: %s", err)
		SendTelegram(str)
	}

	SendTelegram(string(out))

}
