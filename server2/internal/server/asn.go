package server

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
)

func FetchAsnData(asn string) (AsnResult, error) {
	urlOverview := fmt.Sprintf("https://stat.ripe.net/data/as-overview/data.json?resource=%s", asn)
	urlPrefixes := fmt.Sprintf("https://stat.ripe.net/data/announced-prefixes/data.json?resource=%s", asn)

	resp, err := http.Get(urlOverview)
	if err != nil {
		return AsnResult{}, err
	}
	defer resp.Body.Close()

	var overview RipeOverviewResponse
	if err := json.NewDecoder(resp.Body).Decode(&overview); err != nil {
		return AsnResult{}, err
	}

	resp2, err := http.Get(urlPrefixes)
	if err != nil {
		return AsnResult{}, err
	}
	defer resp2.Body.Close()

	var AsnPrefix RipePrefixResponse
	if err := json.NewDecoder(resp2.Body).Decode(&AsnPrefix); err != nil {
		return AsnResult{}, err
	}

	result := AsnResult{
		ASN:    asn,
		Holder: overview.Data.Holder,
	}
	for _, r := range AsnPrefix.Data.Prefixes {
		result.Prefixes = append(result.Prefixes, r.Prefix)
	}

	return result, nil
}

func Asn_Handler(w http.ResponseWriter, r *http.Request) {
	asn := chi.URLParam(r, "asn")
	data, err := FetchAsnData(asn)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, data)
}
