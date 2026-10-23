// Typography of the agreement text (the server sends safe HTML with these class names). Used by every screen that shows it.
export const AGREEMENT_DOC_CSS = `
  .agr-doc { font-size: 15px; line-height: 1.7; color: #0f172a; word-break: break-word; }
  .agr-doc h1 { font-size: 1.2rem; font-weight: 800; text-align: center; margin: 0 0 1rem; }
  .agr-doc h2 { font-size: 1.02rem; font-weight: 800; margin: 1.3rem 0 .4rem; padding-bottom: .2rem; border-bottom: 1px solid #e2e8f0; }
  .agr-doc h3 { font-size: 1rem; font-weight: 700; margin: 1rem 0 .3rem; }
  .agr-doc p { margin: .45rem 0; }
  .agr-doc ol, .agr-doc ul { margin: .5rem 0 .5rem 1.2rem; padding: 0; }
  .agr-doc ol { list-style: decimal; } .agr-doc ul { list-style: disc; }
  .agr-doc li { margin: .35rem 0; }
  .agr-doc hr { margin: 1rem 0; border-color: #e2e8f0; }
  .agr-doc .agr-table { width: 100%; border-collapse: collapse; font-size: .85rem; margin: .6rem 0; }
  .agr-doc .agr-table th, .agr-doc .agr-table td { border: 1px solid #cbd5e1; padding: .35rem .5rem; text-align: left; }
  .agr-doc .agr-table th { background: #f1f5f9; }
  .agr-doc .agr-note { font-size: .85rem; color: #334155; }
  .agr-doc .agr-map { display: flex; justify-content: center; margin: .8rem 0; }
  .agr-doc .agr-sketch { max-width: 100%; height: auto; }
`;
