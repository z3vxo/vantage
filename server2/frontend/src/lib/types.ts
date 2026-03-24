export interface Host {
  id: number
  url: string
  status: string
  sc: string
  title: string
  server: string
  tech: string[]
  ports: { port: string; service: string }[]
  ips: string[]
  cname: string[]
  ctype: string
  triage_status: string
  notes: string
  badges: string[]
}

export interface Hit {
  url: string
  status: string
  sc: string
  size: string
  severity: 'high' | 'medium' | 'low'
}

export interface HostStats {
  total: number
  s200: number
  s403: number
  s500: number
}
