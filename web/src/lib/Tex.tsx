import { useMemo } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'

/** A LaTeX formula rendered with KaTeX; `display` centers it on its own line. */
export function Tex({ children, display = false }: { children: string; display?: boolean }) {
  const html = useMemo(() => katex.renderToString(children, { displayMode: display, throwOnError: false }), [children, display])
  return <span dangerouslySetInnerHTML={{ __html: html }} />
}
