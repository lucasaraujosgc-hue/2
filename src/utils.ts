import * as XLSX from 'xlsx';

export interface ProcessedRecord {
  id: string;
  escola: string;
  porcentagem: number;
  semana: string;
  tipo: string;
}

export function extractDateRange(header: string): string {
  // Matches "11 a 16/06", "11/06 a 16/06", "11-16/06", etc.
  const rangeRegex = /\b(\d{1,2}(?:[\/\-]\d{1,2})?(?:[\/\-]\d{2,4})?)\s*(?:a|-|à|até)\s*(\d{1,2}(?:[\/\-]\d{1,2})?(?:[\/\-]\d{2,4})?)\b/i;
  const match = header.match(rangeRegex);
  if (match) {
    return `${match[1].replace(/-/g, '/')} a ${match[2].replace(/-/g, '/')}`;
  }
  
  const singleDateRegex = /\b(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)\b/;
  const singleMatch = header.match(singleDateRegex);
  if (singleMatch) {
    return singleMatch[1].replace(/-/g, '/');
  }

  const parenMatch = header.match(/\((.*?)\)/);
  if (parenMatch) return parenMatch[1].trim();

  // Clean up common words
  let clean = header
    .replace(/porcentagem|frequ[eê]ncia|per[ií]odo|semana/ig, '')
    .replace(/[\(\)\[\]\{\}]/g, '')
    .trim();
    
  return clean || header;
}

export async function processMultipleFiles(files: File[]) {
  const consolidated = {
    Regular: { rawData: [] as any[], headers: new Set<string>() },
    EJA: { rawData: [] as any[], headers: new Set<string>() }
  };

  for (const file of files) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    
    for (const sheetName of workbook.SheetNames) {
      const type = sheetName.toLowerCase().includes('eja') ? 'EJA' : 'Regular';
      const worksheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null }) as any[][];
      
      let headerRowIdx = -1;
      let schoolColIdx = -1;

      // 1. Find the header row by looking for UNIDADE ESCOLAR / ESCOLA
      for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        if (!row || !Array.isArray(row)) continue;
        
        for (let c = 0; c < row.length; c++) {
          const cellStr = String(row[c] || '').toLowerCase().trim();
          if (cellStr.includes('escola') || cellStr.includes('unidade')) {
            headerRowIdx = r;
            schoolColIdx = c;
            break;
          }
        }
        if (headerRowIdx !== -1) break;
      }

      if (headerRowIdx === -1) continue; // No school column found in this sheet

      const headerRow = rows[headerRowIdx];
      
      // 2. Take exactly the next 2 columns as the periods
      const period1Header = headerRow[schoolColIdx + 1] ? String(headerRow[schoolColIdx + 1]).trim() : null;
      const period2Header = headerRow[schoolColIdx + 2] ? String(headerRow[schoolColIdx + 2]).trim() : null;

      if (period1Header) consolidated[type].headers.add(period1Header);
      if (period2Header) consolidated[type].headers.add(period2Header);

      // 3. Extract the data for these columns
      for (let r = headerRowIdx + 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || !Array.isArray(row)) continue;
        
        const schoolVal = row[schoolColIdx];
        if (schoolVal === undefined || schoolVal === null || String(schoolVal).trim() === '') continue;

        const newRow: any = { '_ESCOLA_': schoolVal };
        
        if (period1Header && row[schoolColIdx + 1] !== undefined && row[schoolColIdx + 1] !== null) {
           newRow[period1Header] = row[schoolColIdx + 1];
        }
        if (period2Header && row[schoolColIdx + 2] !== undefined && row[schoolColIdx + 2] !== null) {
           newRow[period2Header] = row[schoolColIdx + 2];
        }

        consolidated[type].rawData.push(newRow);
      }
    }
  }

  return {
    Regular: {
       rawData: consolidated.Regular.rawData,
       headers: Array.from(consolidated.Regular.headers)
    },
    EJA: {
       rawData: consolidated.EJA.rawData,
       headers: Array.from(consolidated.EJA.headers)
    }
  };
}

export function processMappedData(
  rawData: any[],
  schoolColumn: string,
  periodMappings: { original: string, mappedName: string }[],
  tipo: string
): ProcessedRecord[] {
  const records: ProcessedRecord[] = [];

  rawData.forEach((row, index) => {
    const escolaRaw = row[schoolColumn];
    if (escolaRaw === undefined || escolaRaw === null) return;
    
    const escola = String(escolaRaw).trim();
    if (!escola || escola.toLowerCase() === 'undefined') return;

    periodMappings.forEach(mapping => {
      let val = row[mapping.original];
      if (val === undefined || val === null || String(val).trim() === '') return;

      let porcentagem = 0;
      
      if (typeof val === 'number') {
        porcentagem = val;
        // Fix fractional representation from Excel (e.g., 0.941 -> 94.1)
        if (porcentagem > 0 && porcentagem <= 1.2) {
          porcentagem = porcentagem * 100;
        }
      } else {
        let str = String(val).replace('%', '').replace(',', '.').trim();
        porcentagem = parseFloat(str);
        if (isNaN(porcentagem)) porcentagem = 0;
        
        if (porcentagem > 0 && porcentagem <= 1.2 && (String(val).includes('.') || String(val).includes(','))) {
          porcentagem = porcentagem * 100;
        }
      }

      records.push({
        id: `row-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`,
        escola,
        porcentagem,
        semana: mapping.mappedName,
        tipo
      });
    });
  });

  return records;
}

// Helper to parse dates chronologically from string values (e.g. "03 a 09/09")
export function parseDateForSort(dateStr: string): number {
  const regex = /(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/g;
  let match;
  let lastMatch = null;
  while ((match = regex.exec(dateStr)) !== null) {
    lastMatch = match;
  }
  
  if (lastMatch) {
    const day = parseInt(lastMatch[1], 10);
    const month = parseInt(lastMatch[2], 10);
    let year = new Date().getFullYear();
    if (lastMatch[3]) {
      year = parseInt(lastMatch[3], 10);
      if (year < 100) year += 2000;
    }
    return year * 10000 + month * 100 + day;
  }
  
  const fallbackMatch = dateStr.match(/(\d{1,2})/);
  return fallbackMatch ? parseInt(fallbackMatch[1], 10) : 0;
}

// Aggregation Functions
export function getEvolutionData(data: ProcessedRecord[], escola: string, tipo: string) {
  return data
    .filter(d => d.escola === escola && d.tipo === tipo)
    .sort((a, b) => parseDateForSort(a.semana) - parseDateForSort(b.semana));
}

export function getSchoolsByColor(data: ProcessedRecord[], semana: string, tipo: string) {
  const filtered = data.filter(d => d.semana === semana && d.tipo === tipo);
  const verde: ProcessedRecord[] = [];
  const amarelo: ProcessedRecord[] = [];
  const vermelho: ProcessedRecord[] = [];

  filtered.forEach(d => {
    if (tipo === 'EJA') {
      if (d.porcentagem >= 80) verde.push(d);
      else if (d.porcentagem >= 70) amarelo.push(d);
      else vermelho.push(d);
    } else {
      if (d.porcentagem >= 92) verde.push(d);
      else if (d.porcentagem >= 85) amarelo.push(d);
      else vermelho.push(d);
    }
  });

  const sortDesc = (a: ProcessedRecord, b: ProcessedRecord) => b.porcentagem - a.porcentagem;
  return {
    verde: verde.sort(sortDesc),
    amarelo: amarelo.sort(sortDesc),
    vermelho: vermelho.sort(sortDesc)
  };
}

export function getSchoolComparisons(data: ProcessedRecord[], currentWeek: string, previousWeek: string | null, tipo: string) {
  if (!previousWeek) return { highestGrowth: [], highestDecline: [] };

  const currentData = data.filter(d => d.semana === currentWeek && d.tipo === tipo);
  const previousData = data.filter(d => d.semana === previousWeek && d.tipo === tipo);
  const previousMap = new Map(previousData.map(d => [d.escola, d.porcentagem]));
  const comparisons: { escola: string, pctCurrent: number, pctPrevious: number, delta: number }[] = [];

  currentData.forEach(d => {
    if (previousMap.has(d.escola)) {
      const prev = previousMap.get(d.escola)!;
      comparisons.push({
        escola: d.escola,
        pctCurrent: d.porcentagem,
        pctPrevious: prev,
        delta: Number((d.porcentagem - prev).toFixed(2))
      });
    }
  });

  comparisons.sort((a, b) => b.delta - a.delta);

  return { 
    highestGrowth: comparisons.filter(c => c.delta > 0).slice(0, 5),
    highestDecline: comparisons.filter(c => c.delta < 0).reverse().slice(0, 5)
  };
}

export function getGeneralAverage(data: ProcessedRecord[], tipo: string) {
  const filtered = data.filter(d => d.tipo === tipo);
  const bySemana = new Map<string, { total: number, count: number }>();
  
  filtered.forEach(d => {
    if (!bySemana.has(d.semana)) bySemana.set(d.semana, { total: 0, count: 0 });
    const entry = bySemana.get(d.semana)!;
    entry.total += d.porcentagem;
    entry.count += 1;
  });

  return Array.from(bySemana.entries()).map(([semana, stats]) => ({
    semana,
    media: Number((stats.total / stats.count).toFixed(2))
  })).sort((a, b) => parseDateForSort(a.semana) - parseDateForSort(b.semana));
}

export function getAvailableWeeks(data: ProcessedRecord[], tipo: string) {
  const weeks = new Set(data.filter(d => d.tipo === tipo).map(d => d.semana));
  return Array.from(weeks).sort((a, b) => parseDateForSort(a) - parseDateForSort(b));
}

export function getAvailableSchools(data: ProcessedRecord[], tipo: string) {
  const schools = new Set(data.filter(d => d.tipo === tipo).map(d => d.escola));
  return Array.from(schools).sort();
}
