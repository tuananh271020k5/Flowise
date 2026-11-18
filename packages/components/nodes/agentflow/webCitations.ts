/** Provider-supplied URL annotations only; never invent citations from model prose. */
export function extractWebCitations(metadata: any, content?: unknown) {
    const citations: { pageContent: string; metadata: { source: string; title: string }; source: string; title: string }[] = []
    const seen = new Set<string>()
    const outputs = [
        ...(Array.isArray(metadata?.output) ? metadata.output : []),
        { type: 'message', content: Array.isArray(content) ? content : [] }
    ]
    for (const item of outputs) {
        if (item?.type !== 'message' || !Array.isArray(item.content)) continue
        for (const block of item.content) {
            for (const annotation of Array.isArray(block?.annotations) ? block.annotations : []) {
                const isWebCitation =
                    annotation?.type === 'url_citation' || (annotation?.type === 'citation' && annotation.source === 'url_citation')
                if (!isWebCitation || typeof annotation.url !== 'string' || annotation.url.length > 3072) continue
                let url: URL
                try {
                    url = new URL(annotation.url)
                } catch {
                    continue
                }
                if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || seen.has(url.href)) continue
                seen.add(url.href)
                const title = typeof annotation.title === 'string' ? annotation.title.slice(0, 300) : url.hostname
                citations.push({ pageContent: title, metadata: { source: url.href, title }, source: url.href, title })
                if (citations.length === 20) return citations
            }
        }
    }
    return citations
}
