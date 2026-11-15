export type AnnualSeriesPoint = { year: string; value: number };

function splitCsvLine(line: string, delimiter: string): string[] {
  const values: string[] = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"' && quoted) {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

function numberValue(value: string): number {
  const normalized = value.trim().replace(/\s/g, '').replace(',', '.');
  if (!normalized || /^(-9999?|9999|nan|null|no.?data)$/i.test(normalized)) {
    return Number.NaN;
  }
  return Number(normalized);
}

export function parseAnnualSeriesCsv(
  text: string,
  selectedLayer?: string,
): { rows: AnnualSeriesPoint[]; variable: string; convertedToCelsius: boolean; qualityFiltered: boolean } {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
  const empty = { rows: [] as AnnualSeriesPoint[], variable: '', convertedToCelsius: false, qualityFiltered: false };
  if (lines.length < 2) return empty;

  const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  let headerLineIndex = -1;
  let delimiter = ',';
  let headers: string[] = [];
  let normalized: string[] = [];
  let dateIndex = -1;
  let yearIndex = -1;

  // NASA exports can contain metadata lines before the tabular header.
  for (let lineIndex = 0; lineIndex < Math.min(lines.length - 1, 40); lineIndex += 1) {
    const candidate = lines[lineIndex];
    const candidateDelimiter = candidate.includes('\t') ? '\t' : candidate.includes(';') ? ';' : ',';
    const candidateHeaders = splitCsvLine(candidate, candidateDelimiter);
    const candidateNormalized = candidateHeaders.map(normalize);
    const candidateDateIndex = candidateNormalized.findIndex((header) =>
      /^(date|time|datetime|acquisition_date|date_time|timestamp)$/.test(header) || header.endsWith('_date'),
    );
    const candidateYearIndex = candidateNormalized.findIndex((header) => header === 'year' || header === 'ano');
    const hasValueColumn = candidateNormalized.some((header) =>
      /(lst_day_1km|lst_night_1km|temperature|t2m|precip|rain|_value$|^value$|^mean$|^data$)/.test(header)
      && !/(qc|quality|latitude|longitude)/.test(header),
    );
    if ((candidateDateIndex >= 0 || candidateYearIndex >= 0) && candidateHeaders.length >= 2 && hasValueColumn) {
      headerLineIndex = lineIndex;
      delimiter = candidateDelimiter;
      headers = candidateHeaders;
      normalized = candidateNormalized;
      dateIndex = candidateDateIndex;
      yearIndex = candidateYearIndex;
      break;
    }
  }
  if (headerLineIndex < 0) return empty;

  const preferredLayer = selectedLayer?.toLowerCase() || '';
  let valueIndex = preferredLayer ? normalized.findIndex((header) => header.includes(preferredLayer)) : -1;
  if (valueIndex < 0) {
    valueIndex = normalized.findIndex((header) =>
      /(lst_day_1km|lst_night_1km|temperature|t2m|precip|rain|_value$|^value$|^mean$|^data$)/.test(header)
      && !/(qc|quality|latitude|longitude)/.test(header),
    );
  }
  if (valueIndex < 0) {
    valueIndex = normalized.findIndex((header, index) =>
      index !== dateIndex && index !== yearIndex
      && !/(latitude|longitude|qc|quality|category|site|id)/.test(header),
    );
  }
  if (valueIndex < 0) return empty;

  const variable = headers[valueIndex] || 'value';
  const isLst = /lst_(day|night)_1km/i.test(variable) || /lst_(day|night)_1km/i.test(selectedLayer || '');
  const qualityName = /night/i.test(selectedLayer || variable) ? 'qc_night' : 'qc_day';
  const qualityIndex = isLst ? normalized.findIndex((header) => header.includes(qualityName)) : -1;
  const yearly = new Map<string, { total: number; count: number }>();
  let convertedToCelsius = false;
  let qualityFiltered = false;

  for (const line of lines.slice(headerLineIndex + 1)) {
    const columns = splitCsvLine(line, delimiter);
    const dateValue = dateIndex >= 0 ? columns[dateIndex] : '';
    const yearValue = yearIndex >= 0 ? columns[yearIndex] : dateValue;
    const match = String(yearValue || '').match(/(?:18|19|20|21)\d{2}/);
    if (!match) continue;

    let value = numberValue(columns[valueIndex] || '');
    if (!Number.isFinite(value) || (isLst && value === 0)) continue;

    if (qualityIndex >= 0) {
      const quality = numberValue(columns[qualityIndex] || '');
      if (!Number.isFinite(quality)) continue;
      qualityFiltered = true;
      const qaMandatory = Math.trunc(quality) & 0b11;
      const dataQuality = (Math.trunc(quality) >> 2) & 0b11;
      if (qaMandatory !== 0 || dataQuality !== 0) continue;
    }

    if (isLst && value >= 7500 && value <= 65535) {
      value = value * 0.02 - 273.15;
      convertedToCelsius = true;
    } else if (isLst && value > 100 && value < 400) {
      value -= 273.15;
      convertedToCelsius = true;
    }

    const year = match[0];
    const current = yearly.get(year) || { total: 0, count: 0 };
    current.total += value;
    current.count += 1;
    yearly.set(year, current);
  }

  const rows = [...yearly.entries()]
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([year, item]) => ({ year, value: Number((item.total / item.count).toFixed(3)) }));

  return { rows, variable, convertedToCelsius, qualityFiltered };
}
