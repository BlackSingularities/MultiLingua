// Mały renderer Markdownu dla teorii: akapity, nagłówki ###, listy, tabele, wskazówki (>)
// oraz **pogrubienie** i *kursywa*. Kursywą piszemy słowa w języku kursu — można je odsłuchać.
// Listy w stylu „*fraza* — znaczenie” zamieniają się w zwarty słowniczek.
import { Fragment, type ReactNode } from 'react';

type Say = (text: string) => void;

function inline(text: string, keyBase: string, say?: Say): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('**')) out.push(<strong key={`${keyBase}-${i++}`}>{tok.slice(2, -2)}</strong>);
    else {
      const t = tok.slice(1, -1);
      out.push(
        say ? (
          <button key={`${keyBase}-${i++}`} type="button" className="md-target md-say" onClick={() => say(t.replace(/[→…]/g, ' '))} title="Odsłuchaj">
            {t}
          </button>
        ) : (
          <em key={`${keyBase}-${i++}`} className="md-target">{t}</em>
        ),
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** „*fraza* — znaczenie” albo „**fraza** — znaczenie”: hasło w języku kursu + objaśnienie. */
function asDefinition(item: string): { term: string; def: string } | null {
  const m = /^(.+?)\s+—\s+(.+)$/.exec(item);
  if (!m || !/\*/.test(m[1]) || m[1].length > 90) return null;
  return { term: m[1], def: m[2] };
}

function tipKind(text: string): 'warn' | 'tip' {
  return /^(uważaj|uwaga|pułapka|ostrożnie)/i.test(text.replace(/\*/g, '')) ? 'warn' : 'tip';
}

export function Markdown({ source, onSay, lang }: { source: string; onSay?: Say; lang?: string }) {
  const lines = source.split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.startsWith('### ')) {
      blocks.push(<h3 key={k++}>{inline(line.slice(4), `h${k}`, onSay)}</h3>);
      i++;
      continue;
    }
    if (line.startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        const cells = lines[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        if (!cells.every((c) => /^:?-+:?$/.test(c))) rows.push(cells);
        i++;
      }
      const [head, ...body] = rows;
      const empty = head.every((c) => !c);
      blocks.push(
        <div className="md-table-wrap" key={k++}>
          <table className={`md-table${head.length > 3 ? ' is-wide' : ''}`}>
            {!empty && (
              <thead>
                <tr>{head.map((c, j) => <th key={j} scope="col">{inline(c, `th${k}${j}`)}</th>)}</tr>
              </thead>
            )}
            <tbody>
              {body.map((r, ri) => (
                <tr key={ri}>{r.map((c, j) => <td key={j}>{inline(c, `td${k}${ri}${j}`, onSay)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (line.startsWith('> ')) {
      const parts: string[] = [];
      while (i < lines.length && lines[i].startsWith('> ')) parts.push(lines[i++].slice(2));
      const text = parts.join(' ');
      const kind = tipKind(text);
      blocks.push(
        <aside className={`md-tip md-tip-${kind}`} key={k++}>
          <span className="md-tip-label">{kind === 'warn' ? 'Uwaga' : 'Wskazówka'}</span>
          <p>{inline(text, `tip${k}`, onSay)}</p>
        </aside>,
      );
      continue;
    }
    if (/^[-*] /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) items.push(lines[i++].slice(2));
      const defs = items.map(asDefinition);
      // Słowniczek, gdy większość punktów to „fraza — znaczenie”.
      if (defs.filter(Boolean).length >= Math.ceil(items.length * 0.6)) {
        blocks.push(
          <dl className="md-defs" key={k++} lang={lang}>
            {items.map((it, j) => {
              const d = defs[j];
              return d ? (
                <div className="md-def" key={j}>
                  <dt>{inline(d.term, `dt${k}${j}`, onSay)}</dt>
                  <dd>{inline(d.def, `dd${k}${j}`, onSay)}</dd>
                </div>
              ) : (
                <div className="md-def is-note" key={j}>
                  <dd>{inline(it, `dn${k}${j}`, onSay)}</dd>
                </div>
              );
            })}
          </dl>,
        );
      } else {
        blocks.push(
          <ul key={k++}>
            {items.map((it, j) => <li key={j}>{inline(it, `li${k}${j}`, onSay)}</li>)}
          </ul>,
        );
      }
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(### |\||> |[-*] )/.test(lines[i])) para.push(lines[i++]);
    blocks.push(<p key={k++}>{inline(para.join(' '), `p${k}`, onSay)}</p>);
  }
  return <div className="md">{blocks.map((b, j) => <Fragment key={j}>{b}</Fragment>)}</div>;
}
