package tools

import (
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
	Error  string
}

func SetJob(token string, result JobResult) {
	jobsMu.Lock()
	defer jobsMu.Unlock()
	jobs[token] = result
}

func deleteJob(token string) {
	jobsMu.Lock()
	defer jobsMu.Unlock()
	delete(jobs, token)
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
