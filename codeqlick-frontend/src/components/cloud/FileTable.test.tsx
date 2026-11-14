import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FileTable } from './FileTable';

describe('FileTable', () => {
  it('lists each file with its size under labelled columns', () => {
    const html = renderToStaticMarkup(
      <FileTable
        items={[
          { path: 'index.html', size: 512 },
          { path: 'assets/app.js', size: 1536 },
        ]}
        locale="en"
        caption="Files of this deployment"
        labels={{ path: 'Path', size: 'Size' }}
      />,
    );
    expect(html).toContain('<caption class="visually-hidden">Files of this deployment</caption>');
    expect(html).toMatch(/<th scope="col">Path<\/th>/);
    expect(html).toMatch(/<th scope="col"[^>]*>Size<\/th>/);
    expect(html).toContain('index.html');
    expect(html).toContain('512 B');
    expect(html).toContain('assets/app.js');
    expect(html).toContain('1.5 KB');
    expect(html.match(/<tr>/g)).toHaveLength(3);
    expect(html).not.toContain('Difference');
  });

  it('adds the previous size and the difference for changed files', () => {
    const html = renderToStaticMarkup(
      <FileTable
        items={[{ path: 'index.html', size: 2560, previousSize: 1024 }]}
        locale="es"
        caption="Modificados"
        labels={{
          path: 'Ruta',
          size: 'Este despliegue',
          previousSize: 'Producción',
          change: 'Diferencia',
        }}
      />,
    );
    expect(html).toMatch(/>Producción<\/th>/);
    expect(html).toMatch(/>Diferencia<\/th>/);
    expect(html).toContain('1 KB');
    expect(html).toContain('2,5 KB');
    expect(html).toContain('+1,5 KB');
  });
});
