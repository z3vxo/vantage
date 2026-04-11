package server

type TriageData struct {
	Domain string `json:"domain"`
	Status string `json:"status"`
}

type NewTargetJson struct {
	Domain string `json:"domain"`
}

type NoteStruct struct {
	Domain string `json:"domain"`
	Note   string `json:"notes"`
}

type LoginData struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type Target struct {
	Target string `json:"target"`
}

type RipePrefixTimeline struct {
	StartTime string `json:"starttime"`
	EndTime   string `json:"endtime"`
}

type RipePrefix struct {
	Prefix    string               `json:"prefix"`
	Timelines []RipePrefixTimeline `json:"timelines"`
}

type RipePrefixData struct {
	Prefixes []RipePrefix `json:"prefixes"`
}

type RipePrefixResponse struct {
	Status     string         `json:"status"`
	StatusCode int            `json:"status_code"`
	Data       RipePrefixData `json:"data"`
}

type AsnResult struct {
	ASN      string   `json:"asn"`
	Holder   string   `json:"holder"`
	Prefixes []string `json:"prefixes"`
}

type RipeOverviewData struct {
	Holder    string `json:"holder"`
	Announced bool   `json:"announced"`
}

type RipeOverviewResponse struct {
	Status     string           `json:"status"`
	StatusCode int              `json:"status_code"`
	Data       RipeOverviewData `json:"data"`
}
