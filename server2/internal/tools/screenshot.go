package tools

import (
	"os/exec"

	"sync"
)

type JobStatus string

const (
	JobPending JobStatus = "pending"
	JobDone    JobStatus = "done"
	JobFailed  JobStatus = "failed"
)

type JobResult struct {
	Status JobStatus
	Path   string
	Error  string
}

var (
	jobs   = make(map[string]JobResult)
	jobsMu sync.RWMutex
)

func GetJob(token string) (JobResult, bool) {
	jobsMu.RLock()
	defer jobsMu.RUnlock()
	result, ok := jobs[token]
	return result, ok
}

func SetJob(token string, result JobResult) {
	jobsMu.Lock()
	defer jobsMu.Unlock()
	jobs[token] = result
}

func Screenshot(domain string, uuid string) {

	SetJob(uuid, JobResult{Status: JobPending})

	err := exec.Command("gowitness", "scan", "single", "-u", domain, "--screenshot-path", "./image")

}
