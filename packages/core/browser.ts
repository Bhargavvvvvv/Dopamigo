export const matchesDomain = (hostname: string, domains: string[]) => domains.some(domain => hostname === domain || hostname.endsWith(`.${domain}`));
