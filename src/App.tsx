
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Activity,
  ArrowUpRight,
  BookOpen,
  ChartNoAxesCombined,
  Download,
  FileDown,
  Globe2,
  HeartPulse,
  Info,
  Leaf,
  MapPin,
  Microscope,
  Satellite,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import LocationFilter from './components/map/LocationFilter';
import CityMap from './components/map/CityMap';
import AccessibilityTools from './components/AccessibilityTools';
import LanguageSelector from './components/LanguageSelector';

import type { SelectedLocation } from './types/location';
import { parseAnnualSeriesCsv } from './services/seriesCsv';
import { extrairMensagemErro } from './services/api';
import { analyzeAnnualTrend } from './services/trendAnalysis';

import {
  getAppEEARSStatus,
  submitAppEEARSTask,
  getAppEEARSTask,
  getAppEEARSBundle,
  downloadAppEEARSFile,
  getGiovanniTimeSeries,
  getGiovanniVariables,
  type AppEEARSStatus,
} from './services/appeearsService';

import './styles/global.css';
import './App.css';
import './styles/compact.css';

// --------------------------------------------------
// TIPOS
// --------------------------------------------------

type TrendRow = {
  year: string;
  value: number;
};

type ChartPoint = {
  year: string;
  observed: number | null;
  projected: number | null;
};

type GiovanniVariableOption = {
  value: string;
  label: string;
  unit?: string;
  description?: string;
};

type GiovanniSummary = {
  source: string;
  variable: string;
  unit: string;
  location: string;
  period: string;
  notice: string;
  rows: TrendRow[];
};

type GiovanniParsedSeries =
  ReturnType<typeof parseAnnualSeriesCsv> & {
    unit?: string;
    countsByYear?: Record<string, number>;
  };

type ProjectionSummary = {
  startYear: string;
  endYear: string;
  startValue: number;
  endValue: number;
  change: number;
  lastObservedYear: string;
  count: number;
};

// --------------------------------------------------
// UTILITÁRIOS
// --------------------------------------------------

function valueLabel(value: number, unit: string): string {
  return `${value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ${unit}`.trim();
}

function temperatureName(
  id: string,
  locale: string,
): string {
  const spanish = locale.startsWith('es');
  const english = locale.startsWith('en');

  const base = english
    ? 'Air temperature'
    : spanish
      ? 'Temperatura del aire'
      : 'Temperatura do ar';

  const dataset = /^FLDAS/i.test(id)
    ? 'FLDAS'
    : /^GLDAS/i.test(id)
      ? 'GLDAS'
      : /^(AIRS|AIRX)/i.test(id)
        ? 'AIRS'
        : /^M2/i.test(id)
          ? 'MERRA-2'
          : 'NASA';

  let detail = '';

  if (/SurfAirTemp_A/i.test(id)) {
    detail = english
      ? 'ascending satellite pass'
      : spanish
        ? 'pasada ascendente del satélite'
        : 'passagem ascendente do satélite';
  } else if (/SurfAirTemp_D/i.test(id)) {
    detail = english
      ? 'descending satellite pass'
      : spanish
        ? 'pasada descendente del satélite'
        : 'passagem descendente do satélite';
  } else if (/T2MMAX/i.test(id)) {
    detail = english
      ? 'daily maximum'
      : spanish
        ? 'máxima diaria'
        : 'máxima diária';
  } else if (/T2MMIN/i.test(id)) {
    detail = english
      ? 'daily minimum'
      : spanish
        ? 'mínima diaria'
        : 'mínima diária';
  } else if (/_M_|3STM|NXASM/i.test(id)) {
    detail = english
      ? 'monthly dataset'
      : spanish
        ? 'datos mensuales'
        : 'dados mensais';
  } else if (/_D_|3STD|DNXSLV/i.test(id)) {
    detail = english
      ? 'daily dataset'
      : spanish
        ? 'datos diarios'
        : 'dados diários';
  } else if (/3H|T1NXSLV/i.test(id)) {
    detail = english
      ? 'subdaily dataset'
      : spanish
        ? 'datos subdiarios'
        : 'dados subdiários';
  }

  return `${dataset} · ${base}${
    detail ? ` (${detail})` : ''
  }`;
}

function isSupportedAirTemperature(
  item: GiovanniVariableOption,
): boolean {
  const id = item.value;

  return (
    /(?:^|[_.])Tair_f_(?:tavg|inst)(?:$|[_.])/i.test(id) ||
    /SurfAirTemp(?:_D|_A)?(?:$|[_.])/i.test(id) ||
    /(?:^|[_.])T2M(?:$|[_.])/i.test(id) ||
    /(?:^|[_.])T2M(?:M|MAX|MIN)(?:$|[_.])/i.test(id)
  );
}

function preferredTemperatureRank(
  item: GiovanniVariableOption,
): number {
  if (/^FLDAS.*Tair_f_tavg/i.test(item.value)) return 0;
  if (/^GLDAS.*Tair_f_tavg/i.test(item.value)) return 1;
  if (/SurfAirTemp_D/i.test(item.value)) return 2;
  if (/SurfAirTemp_A/i.test(item.value)) return 3;
  if (/T2M/i.test(item.value)) return 4;
  return 5;
}

// --------------------------------------------------
// CATÁLOGO GIOVANNI
// --------------------------------------------------

function extractGiovanniVariables(
  payload: unknown,
): GiovanniVariableOption[] {
  const unwrap = (
    value: unknown,
    depth = 0,
  ): unknown[] => {
    if (depth > 4 || value == null) return [];
    if (Array.isArray(value)) return value;
    if (typeof value !== 'object') return [];

    const object = value as Record<string, unknown>;

    for (const key of [
      'variables',
      'data',
      'results',
      'items',
      'configured_variables',
      'configuredVariables',
    ]) {
      if (object[key] !== undefined) {
        const nested = unwrap(object[key], depth + 1);
        if (nested.length) return nested;
      }
    }

    return Object.entries(object).map(([key, item]) =>
      item && typeof item === 'object'
        ? {
            id: key,
            ...(item as Record<string, unknown>),
          }
        : {
            id: key,
            label: String(item ?? key),
          },
    );
  };

  const options = unwrap(payload).flatMap(
    (entry): GiovanniVariableOption[] => {
      if (
        typeof entry === 'string' ||
        typeof entry === 'number'
      ) {
        const value = String(entry).trim();

        return value
          ? [{ value, label: value }]
          : [];
      }

      if (!entry || typeof entry !== 'object') {
        return [];
      }

      const item = entry as Record<string, unknown>;

      const value = [
        item.data,
        item.data_id,
        item.variable_id,
        item.short_name,
        item.shortName,
        item.id,
        item.variable,
        item.name,
      ].find(
        (candidate) =>
          typeof candidate === 'string' ||
          typeof candidate === 'number',
      );

      if (value === undefined) return [];

      const identifier = String(value).trim();

      if (!identifier) return [];

      const labelValue = [
        item.long_name,
        item.longName,
        item.title,
        item.label,
        item.display_name,
        item.description,
        item.name,
      ].find(
        (candidate) =>
          typeof candidate === 'string' &&
          candidate.trim(),
      );

      const unitValue = item.units ?? item.unit;

      const descriptionValue = item.description;

      return [
        {
          value: identifier,
          label:
            typeof labelValue === 'string'
              ? labelValue.trim()
              : identifier,
          ...(typeof unitValue === 'string'
            ? { unit: unitValue }
            : {}),
          ...(typeof descriptionValue === 'string'
            ? { description: descriptionValue }
            : {}),
        },
      ];
    },
  );

  return [
    ...new Map(
      options.map((item) => [item.value, item]),
    ).values(),
  ];
}

// --------------------------------------------------
// INTERPRETAÇÃO DA RESPOSTA GIOVANNI
// --------------------------------------------------

function parseGiovanniResponse(
  payload: unknown,
  variable: string,
): GiovanniParsedSeries {
  const empty = (): GiovanniParsedSeries => ({
    rows: [],
    variable,
    convertedToCelsius: false,
    qualityFiltered: false,
  });

  const fromRecords = (
    records: Array<{
      date: unknown;
      value: unknown;
    }>,
    unit?: string,
    missingValue = -9999,
  ): GiovanniParsedSeries => {
    const years = new Map<
      string,
      { sum: number; count: number }
    >();

    const convertKelvin =
      /(?:^|[_.])Tair|SurfAirTemp|T2M/i.test(variable) &&
      /^(K|kelvin)$/i.test(unit?.trim() ?? '');

    for (const record of records) {
      const year = String(
        record.date ?? '',
      ).match(/^(?:18|19|20|21)\d{2}/)?.[0];

      if (
        !year ||
        record.value === null ||
        record.value === undefined ||
        String(record.value).trim() === ''
      ) {
        continue;
      }

      const numeric = Number(
        String(record.value).trim(),
      );

      if (
        !Number.isFinite(numeric) ||
        numeric === missingValue ||
        numeric <= -900
      ) {
        continue;
      }

      const value = convertKelvin
        ? numeric - 273.15
        : numeric;

      const entry = years.get(year) ?? {
        sum: 0,
        count: 0,
      };

      entry.sum += value;
      entry.count++;

      years.set(year, entry);
    }

    const rows = [...years.entries()]
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([year, entry]) => ({
        year,
        value: Number(
          (entry.sum / entry.count).toFixed(4),
        ),
      }));

    return {
      rows,
      variable,
      convertedToCelsius: convertKelvin,
      qualityFiltered: false,
      unit: convertKelvin ? '°C' : unit,
      countsByYear: Object.fromEntries(
        [...years].map(([year, entry]) => [
          year,
          entry.count,
        ]),
      ),
    };
  };

  const parseText = (
    raw: string,
  ): GiovanniParsedSeries => {
    const text = raw.replace(/^\uFEFF/, '').trim();

    if (!text) return empty();

    if (
      text.startsWith('{') ||
      text.startsWith('[')
    ) {
      try {
        return parseGiovanniResponse(
          JSON.parse(text),
          variable,
        );
      } catch {
        return empty();
      }
    }

    const lines = text.split(/\r?\n/);
    const metadata = new Map<string, string>();

    let headerIndex = -1;
    let separator = ',';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (
        /^timestamp\s*\(UTC\)\s*[,;\t]\s*data\s*$/i.test(line) ||
        /^(?:date|time|timestamp)\s*[,;\t]\s*(?:value|data)\s*$/i.test(line)
      ) {
        headerIndex = i;

        separator = line.includes('\t')
          ? '\t'
          : line.includes(';')
            ? ';'
            : ',';

        break;
      }

      const index = line.indexOf(',');

      if (index > 0) {
        metadata.set(
          line.slice(0, index).trim().toLowerCase(),
          line.slice(index + 1).trim(),
        );
      }
    }

    if (headerIndex >= 0) {
      const records = lines
        .slice(headerIndex + 1)
        .map((line) => {
          const index = line.indexOf(separator);

          return index === -1
            ? { date: '', value: '' }
            : {
                date: line
                  .slice(0, index)
                  .trim()
                  .replace(/^"|"$/g, ''),
                value: line
                  .slice(index + 1)
                  .trim()
                  .replace(/^"|"$/g, ''),
              };
        });

      const missing = Number(
        metadata.get('undef'),
      );

      return fromRecords(
        records,
        metadata.get('unit'),
        Number.isFinite(missing)
          ? missing
          : -9999,
      );
    }

    const fallback = parseAnnualSeriesCsv(text);

    return {
      ...fallback,
      variable: fallback.variable || variable,
    };
  };

  if (typeof payload === 'string') {
    return parseText(payload);
  }

  if (Array.isArray(payload)) {
    const records = payload.filter(
      (row): row is Record<string, unknown> =>
        !!row &&
        typeof row === 'object' &&
        !Array.isArray(row),
    );

    if (!records.length) return empty();

    const keys = Object.keys(records[0]);

    const dateKey = keys.find((key) =>
      /date|time|year|timestamp/i.test(key),
    );

    const valueKey =
      keys.find(
        (key) =>
          key === variable ||
          /^(value|mean|data)$/i.test(key),
      ) ||
      keys.find(
        (key) =>
          !/date|time|year|lat|lon|quality/i.test(key) &&
          records.some(
            (row) =>
              row[key] != null &&
              row[key] !== '' &&
              Number.isFinite(Number(row[key])),
          ),
      );

    if (!dateKey || !valueKey) {
      return empty();
    }

    return fromRecords(
      records.map((row) => ({
        date: row[dateKey],
        value: row[valueKey],
      })),
    );
  }

  if (payload && typeof payload === 'object') {
    const obj = payload as Record<
      string,
      unknown
    >;

    for (const key of [
      'csv',
      'text',
      'content',
      'data',
      'results',
      'series',
      'timeseries',
      'timeSeries',
      'values',
    ]) {
      if (
        obj[key] !== undefined &&
        obj[key] !== payload
      ) {
        const result = parseGiovanniResponse(
          obj[key],
          variable,
        );

        if (result.rows.length) {
          return result;
        }
      }
    }
  }

  return empty();
}

// --------------------------------------------------
// EXPORTAÇÃO
// --------------------------------------------------

function downloadText(
  content: string,
  filename: string,
  type = 'text/plain;charset=utf-8',
) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}

function downloadCsv(
  rows: Array<Record<string, string | number>>,
  filename: string,
) {
  if (!rows.length) return;

  const headers = Object.keys(rows[0]);

  const csv = [
    headers.join(';'),
    ...rows.map((row) =>
      headers
        .map(
          (header) =>
            `"${String(
              row[header] ?? '',
            ).replace(/"/g, '""')}"`,
        )
        .join(';'),
    ),
  ].join('\r\n');

  downloadText(
    '\uFEFF' + csv,
    filename,
    'text/csv;charset=utf-8;',
  );
}

function getTaskId(result: any): string {
  if (Array.isArray(result)) {
    return String(
      result[0]?.task_id || result[0] || '',
    );
  }

  return String(
    result?.task_id ||
    result?.taskId ||
    result?.id ||
    '',
  );
}

// --------------------------------------------------
// COMPONENTE PRINCIPAL
// --------------------------------------------------

export default function App() {
  const { t, i18n } = useTranslation();

  const [showHealth, setShowHealth] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [measurementSource, setMeasurementSource] = useState<'giovanni' | 'appeears'>('giovanni');

  const [location, setLocation] =
    useState<SelectedLocation | null>(null);

  const [apiStatus, setApiStatus] =
    useState<AppEEARSStatus | null>(null);

  const [taskLoading, setTaskLoading] = useState(false);
  const [taskMessage, setTaskMessage] = useState('');
  const [taskId, setTaskId] = useState('');
  const [taskState, setTaskState] = useState('');
  const [taskFiles, setTaskFiles] = useState<any[]>([]);

  const [startDate, setStartDate] =
    useState('2020-01-01');

  const [endDate, setEndDate] =
    useState('2024-12-31');

  const [layer, setLayer] =
    useState('LST_Day_1km');

  const [taskLayer, setTaskLayer] =
    useState('LST_Day_1km');

  const [importedRows, setImportedRows] =
    useState<TrendRow[]>([]);

  const [seriesSource, setSeriesSource] = useState('');
  const [seriesVariable, setSeriesVariable] = useState('');
  const [seriesUnit, setSeriesUnit] = useState('');

  const [activeTab, setActiveTab] =
    useState<'observed' | 'projection'>('observed');

  const [giovanniVariable, setGiovanniVariable] =
    useState('');

  const [giovanniVariables, setGiovanniVariables] =
    useState<GiovanniVariableOption[]>([]);

  const [
    giovanniCatalogLoading,
    setGiovanniCatalogLoading,
  ] = useState(false);

  const [
    giovanniCatalogError,
    setGiovanniCatalogError,
  ] = useState('');

  const [giovanniLoading, setGiovanniLoading] =
    useState(false);

  const [giovanniResult, setGiovanniResult] =
    useState('');

  const [giovanniSummary, setGiovanniSummary] =
    useState<GiovanniSummary | null>(null);

  const [giovanniMessage, setGiovanniMessage] =
    useState('');

  // --------------------------------------------------
  // STATUS APPEEARS
  // --------------------------------------------------

  useEffect(() => {
    let active = true;

    getAppEEARSStatus()
      .then((status) => {
        if (active) {
          setApiStatus(status);
        }
      })
      .catch(() => {
        if (active) {
          setApiStatus({
            configured: false,
            provider: 'NASA AppEEARS',
            message:
              'Backend indisponível. Inicie a API na porta 3000.',
          });
        }
      });

    return () => {
      active = false;
    };
  }, []);

  // --------------------------------------------------
  // CATÁLOGO GIOVANNI
  // --------------------------------------------------

  useEffect(() => {
    let active = true;

    async function loadGiovanniCatalog() {
      setGiovanniCatalogLoading(true);
      setGiovanniCatalogError('');

      try {
        const response = await getGiovanniVariables();

        const options =
          extractGiovanniVariables(response);

        if (!active) return;

        const temperatureOptions = options
          .filter(isSupportedAirTemperature)
          .sort(
            (a, b) =>
              preferredTemperatureRank(a) -
              preferredTemperatureRank(b),
          );

        setGiovanniVariables(temperatureOptions);

        setGiovanniVariable((current) =>
          temperatureOptions.some(
            (item) => item.value === current,
          )
            ? current
            : (temperatureOptions[0]?.value ?? ''),
        );

        if (!temperatureOptions.length) {
          setGiovanniCatalogError(
            'Nenhuma variável compatível de temperatura do ar foi encontrada no catálogo NASA.',
          );
        }
      } catch {
        if (active) {
          setGiovanniCatalogError(
            'Não foi possível carregar o catálogo Giovanni.',
          );
        }
      } finally {
        if (active) {
          setGiovanniCatalogLoading(false);
        }
      }
    }

    void loadGiovanniCatalog();

    return () => {
      active = false;
    };
  }, []);

  // --------------------------------------------------
  // ACOMPANHAMENTO DAS TAREFAS APPEEARS
  // --------------------------------------------------

  useEffect(() => {
    if (!taskId) return;

    let active = true;
    let timer: number | undefined;

    const checkTask = async () => {
      try {
        const result: any =
          await getAppEEARSTask(taskId);

        if (!active) return;

        const status = String(
          result?.status ||
          result?.task_status ||
          'unknown',
        ).toLowerCase();

        setTaskState(status);

        if (
          status === 'done' ||
          status === 'complete' ||
          status === 'completed'
        ) {
          setTaskMessage(t('app.taskDone'));

          const bundle: any =
            await getAppEEARSBundle(taskId);

          if (active) {
            const files = Array.isArray(bundle?.files)
              ? bundle.files
              : [];

            setTaskFiles(files);

            const csvFile = files.find(
              (file: any) =>
                String(
                  file?.file_name || '',
                ).toLowerCase().endsWith('.csv') &&
                file?.file_id,
            );

            if (csvFile) {
              try {
                const blob =
                  await downloadAppEEARSFile(
                    taskId,
                    String(csvFile.file_id),
                  );

                if (!active) return;

                const originalCsv = await blob.text();
                const parsed = parseAnnualSeriesCsv(originalCsv, taskLayer);

                if (parsed.rows.length >= 2) {
                  setImportedRows(parsed.rows);
                  setSeriesSource('NASA AppEEARS');

                  setSeriesVariable(
                    parsed.variable || taskLayer,
                  );

                  setSeriesUnit(
                    parsed.convertedToCelsius
                      ? '°C'
                      : t('app.unitUnknown'),
                  );

                  setActiveTab(parsed.rows.length >= 3 ? 'projection' : 'observed');
                  setGiovanniResult(originalCsv);
                  setGiovanniSummary({
                    source: 'NASA AppEEARS',
                    variable: parsed.variable || taskLayer,
                    unit: parsed.convertedToCelsius ? '°C' : t('app.unitUnknown'),
                    location: location?.city?.name || location?.state?.name || location?.country?.name || 'Local selecionado',
                    period: `${startDate} a ${endDate}`,
                    notice: 'Extração AppEEARS concluída. Verifique a qualidade e as unidades nos metadados.',
                    rows: [...parsed.rows].sort((a, b) => Number(a.year) - Number(b.year)),
                  });

                  setTaskMessage(
                    t('app.taskDataLoaded', {
                      count: parsed.rows.length,
                    }) +
                    (parsed.qualityFiltered
                      ? t('app.qcApplied')
                      : t('app.qcMissing')),
                  );
                } else {
                  setTaskMessage(
                    t('app.taskDone') +
                    ' ' +
                    t('app.csvInvalid'),
                  );
                }
              } catch {
                if (active) {
                  setTaskMessage(t('app.taskDone'));
                }
              }
            }
          }

          return;
        }

        if (
          [
            'error',
            'failed',
            'cancelled',
            'canceled',
          ].includes(status)
        ) {
          setTaskMessage(t('app.taskFailed'));
          return;
        }

        timer = window.setTimeout(checkTask, 10000);
      } catch {
        if (active) {
          timer = window.setTimeout(checkTask, 20000);
        }
      }
    };

    timer = window.setTimeout(checkTask, 3000);

    return () => {
      active = false;

      if (timer) {
        window.clearTimeout(timer);
      }
    };
  }, [taskId, t, taskLayer]);

  // --------------------------------------------------
  // LOCALIZAÇÃO
  // --------------------------------------------------

  const locationName =
    location?.city?.name ||
    location?.state?.name ||
    location?.country?.name ||
    t('app.world');

  const coordinates = location
    ? `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`
    : t('app.selectLocation');

  // --------------------------------------------------
  // PROJEÇÃO DE CINCO ANOS
  // --------------------------------------------------

  const trend = useMemo<ChartPoint[]>(() => {
    if (importedRows.length < 3) return [];

    const ordered = [...importedRows].sort(
      (a, b) =>
        Number(a.year) - Number(b.year),
    );

    const xs = ordered.map((row) =>
      Number(row.year),
    );

    const ys = ordered.map((row) => row.value);

    const meanX =
      xs.reduce((sum, value) => sum + value, 0) /
      xs.length;

    const meanY =
      ys.reduce((sum, value) => sum + value, 0) /
      ys.length;

    const denominator = xs.reduce(
      (sum, value) =>
        sum + (value - meanX) ** 2,
      0,
    );

    if (!denominator) return [];

    const slope =
      xs.reduce(
        (sum, value, index) =>
          sum +
          (value - meanX) *
          (ys[index] - meanY),
        0,
      ) / denominator;

    const intercept = meanY - slope * meanX;

    const history: ChartPoint[] = ordered.map(
      (row, index) => ({
        year: row.year,
        observed: row.value,
        projected:
          index === ordered.length - 1
            ? row.value
            : null,
      }),
    );

    const lastYear = xs[xs.length - 1];

    const future: ChartPoint[] = Array.from(
      { length: 5 },
      (_, index) => {
        const targetYear = lastYear + index + 1;

        return {
          year: String(targetYear),
          observed: null,
          projected: Number(
            (
              intercept +
              slope * targetYear
            ).toFixed(4),
          ),
        };
      },
    );

    return [...history, ...future];
  }, [importedRows]);

  const trendStatistics = useMemo(
    () => analyzeAnnualTrend(importedRows),
    [importedRows],
  );

  const projectionSummary =
    useMemo<ProjectionSummary | null>(() => {
      const ordered = [...importedRows].sort(
        (a, b) =>
          Number(a.year) - Number(b.year),
      );

      if (ordered.length < 3) return null;

      const years = new Set(
        ordered.map((item) => item.year),
      );

      if (years.size !== ordered.length) {
        return null;
      }

      const lastObserved =
        ordered[ordered.length - 1];

      const projections = trend.filter(
        (point) =>
          Number(point.year) >
            Number(lastObserved.year) &&
          point.projected !== null,
      );

      if (projections.length !== 5) return null;

      const initial = projections[0];
      const final = projections[4];

      const startValue = initial.projected!;
      const endValue = final.projected!;

      return {
        startYear: initial.year,
        endYear: final.year,
        startValue,
        endValue,
        change:
          endValue - lastObserved.value,
        lastObservedYear: lastObserved.year,
        count: ordered.length,
      };
    }, [trend, importedRows]);

  // --------------------------------------------------
  // CONSULTA APPEEARS
  // --------------------------------------------------

  async function createExtraction() {
    if (!location) {
      setTaskMessage(t('app.selectFirst'));
      return;
    }

    if (startDate > endDate) {
      setTaskMessage(t('app.dateError'));
      return;
    }

    setGiovanniResult('');
    setGiovanniSummary(null);
    setImportedRows([]);
    setTaskLoading(true);
    setTaskMessage('');
    setTaskId('');
    setTaskFiles([]);
    setTaskState('');
    setTaskLayer(layer);

    try {
      const result = await submitAppEEARSTask({
        name: `CTRLClima - ${locationName}`,
        latitude: location.latitude,
        longitude: location.longitude,
        startDate,
        endDate,
        product: 'MOD11A2.061',
        layer,
      });

      const id = getTaskId(result);

      setTaskId(id);

      setTaskMessage(
        id
          ? t('app.taskSent', { id })
          : t('app.taskNoId'),
      );
    } catch (error: unknown) {
      setTaskMessage(
        extrairMensagemErro(error),
      );
    } finally {
      setTaskLoading(false);
    }
  }

  async function downloadTaskFile(file: any) {
    if (!taskId || !file?.file_id) return;

    try {
      const blob = await downloadAppEEARSFile(
        taskId,
        String(file.file_id),
      );

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');

      link.href = url;
      link.download =
        file.file_name ||
        `appeears-${file.file_id}`;

      link.click();
      URL.revokeObjectURL(url);

      if (
        String(
          file.file_name || '',
        ).toLowerCase().endsWith('.csv')
      ) {
        const originalCsv = await blob.text();
        const parsed = parseAnnualSeriesCsv(originalCsv, taskLayer);

        if (parsed.rows.length >= 2) {
          setImportedRows(parsed.rows);
          setSeriesSource('NASA AppEEARS');

          setSeriesVariable(
            parsed.variable || taskLayer,
          );

          setSeriesUnit(
            parsed.convertedToCelsius
              ? '°C'
              : t('app.unitUnknown'),
          );

          setActiveTab(parsed.rows.length >= 3 ? 'projection' : 'observed');
          setGiovanniResult(originalCsv);
          setGiovanniSummary({
            source: 'NASA AppEEARS',
            variable: parsed.variable || taskLayer,
            unit: parsed.convertedToCelsius ? '°C' : t('app.unitUnknown'),
            location: locationName,
            period: `${startDate} a ${endDate}`,
            notice: 'CSV AppEEARS carregado pelo CTRLClima.',
            rows: [...parsed.rows].sort((a, b) => Number(a.year) - Number(b.year)),
          });

          setTaskMessage(
            t('app.csvImported', {
              count: parsed.rows.length,
            }),
          );
        } else {
          setTaskMessage(t('app.csvInvalid'));
        }
      }
    } catch {
      setTaskMessage(t('app.taskError'));
    }
  }

  // --------------------------------------------------
  // CONSULTA GIOVANNI
  // --------------------------------------------------

  async function queryGiovanni() {
    if (!location) {
      setGiovanniMessage(
        'Selecione uma localização.',
      );
      return;
    }

    if (!giovanniVariable.trim()) {
      setGiovanniMessage(
        'Selecione uma variável climática.',
      );
      return;
    }

    if (startDate > endDate) {
      setGiovanniMessage(
        'O período selecionado é inválido.',
      );
      return;
    }

    setGiovanniLoading(true);
    setImportedRows([]);
    setGiovanniResult('');
    setGiovanniSummary(null);

    setGiovanniMessage(
      'Consultando dados reais da NASA...',
    );

    try {
      const result = await getGiovanniTimeSeries({
        data: giovanniVariable.trim(),
        latitude: location.latitude,
        longitude: location.longitude,
        start: startDate,
        end: endDate,
      });

      const resultMeta = result as typeof result & {
        source?: string;
        unit?: string;
        variable?: string;
        notice?: string;
      };

      if (
        /NASA POWER/i.test(
          resultMeta.source ?? '',
        )
      ) {
        throw new Error(
          'O CTRLClima aceita somente dados NASA Giovanni e NASA AppEEARS.',
        );
      }

      const payload =
        resultMeta?.data ?? resultMeta;

      const content =
        typeof payload === 'string'
          ? payload
          : JSON.stringify(payload, null, 2);

      if (
        /<!doctype\s+html|<html[\s>]/i.test(
          content,
        ) ||
        /urs\.earthdata\.nasa\.gov/i.test(
          content,
        )
      ) {
        throw new Error(
          'A NASA solicitou autenticação Earthdata. Verifique as permissões do backend.',
        );
      }

      const parsed = parseGiovanniResponse(
        payload,
        giovanniVariable.trim(),
      );

      setGiovanniResult(content);

      if (!parsed.rows.length) {
        setGiovanniMessage(
          'A NASA respondeu, mas não foi possível extrair uma série anual válida.',
        );
        return;
      }

      const variableInfo = giovanniVariables.find(
        (item) =>
          item.value === giovanniVariable.trim(),
      );

      const resolvedUnit =
        parsed.unit ||
        resultMeta.unit ||
        variableInfo?.unit ||
        t('app.unitUnknown');

      const resolvedSource =
        resultMeta.source ||
        'NASA Giovanni / GES DISC';

      const resolvedVariable =
        resultMeta.variable ||
        parsed.variable ||
        giovanniVariable.trim();

      setImportedRows(parsed.rows);
      setSeriesSource(resolvedSource);
      setSeriesVariable(resolvedVariable);
      setSeriesUnit(resolvedUnit);

      setGiovanniSummary({
        source: resolvedSource,
        variable: resolvedVariable,
        unit: resolvedUnit,
        location: locationName,
        period: `${startDate} a ${endDate}`,
        notice: resultMeta.notice || '',
        rows: [...parsed.rows].sort(
          (a, b) =>
            Number(a.year) - Number(b.year),
        ),
      });

      // Exibe automaticamente a projeção quando
      // há pelo menos três médias anuais.
      setActiveTab(
        parsed.rows.length >= 3
          ? 'projection'
          : 'observed',
      );

      setGiovanniMessage(
        `${parsed.rows.length} registro(s) anual(is) carregado(s). Resultados disponíveis no gráfico de tendências.`,
      );
    } catch (error: unknown) {
      setGiovanniMessage(
        extrairMensagemErro(error),
      );
      setGiovanniResult('');
      setGiovanniSummary(null);
    } finally {
      setGiovanniLoading(false);
    }
  }

  // --------------------------------------------------
  // IMPORTAÇÃO CSV
  // --------------------------------------------------

  function handleCsv(file?: File) {
    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      const parsed = parseAnnualSeriesCsv(
        String(reader.result || ''),
        layer,
      );

      setGiovanniResult('');
      setGiovanniSummary(null);
      setImportedRows(parsed.rows);
      setSeriesSource(t('app.userCsvSource'));
      setSeriesVariable(parsed.variable || '');

      setSeriesUnit(
        parsed.convertedToCelsius
          ? '°C'
          : t('app.unitUnknown'),
      );

      setActiveTab('observed');

      setTaskMessage(
        parsed.rows.length >= 2
          ? t('app.csvImported', {
              count: parsed.rows.length,
            })
          : t('app.csvInvalid'),
      );
    };

    reader.readAsText(file);
  }

  const reportRows = importedRows.map((row) => ({
    year: row.year,
    value: row.value,
    location: locationName,
    latitude: location?.latitude ?? '',
    longitude: location?.longitude ?? '',
    source:
      seriesSource || t('app.unknownSource'),
    variable:
      seriesVariable || t('app.unknownVariable'),
    unit:
      seriesUnit || t('app.unitUnknown'),
    period: `${
      importedRows[0]?.year || ''
    }–${
      importedRows[importedRows.length - 1]?.year || ''
    }`,
  }));

  // --------------------------------------------------
  // INTERFACE
  // --------------------------------------------------

  return (
    <div className="ctrl-app">
      <header className="topbar">
        <a
          className="brand"
          href="#inicio"
          aria-label={t('app.homeAria')}
        >
          <span className="brand-mark">
            <Globe2 size={22} />
          </span>

          <span>
            <strong>
              CTRL<span>Clima</span>
            </strong>
            <small>{t('app.brandTag')}</small>
          </span>
        </a>

        <nav
          className="main-nav"
          aria-label={t('app.mainNav')}
        >
          <a href="#explorar">
            {t('app.navExplore')}
          </a>

          <a
            href="#saude"
            onClick={() => {
              setShowHealth(true);

              requestAnimationFrame(() =>
                document
                  .getElementById('saude')
                  ?.scrollIntoView({
                    behavior: 'smooth',
                  }),
              );
            }}
          >
            {t('app.navHealth')}
          </a>

          <a href="#tendencias">
            {t('app.navTrends')}
          </a>

          <a
            href="#fontes"
            onClick={() => {
              setShowSources(true);

              requestAnimationFrame(() =>
                document
                  .getElementById('fontes')
                  ?.scrollIntoView({
                    behavior: 'smooth',
                  }),
              );
            }}
          >
            {t('app.navSources')}
          </a>
        </nav>

        <div className="header-tools">
          <LanguageSelector />
          <AccessibilityTools />
        </div>
      </header>

      <main id="inicio">
        {/* APRESENTAÇÃO */}

        <section className="hero-section">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="pulse-dot" />
              {t('app.heroEyebrow')}
            </div>

            <h1>
              {t('app.heroTitle1')}
              <br />
              <em>{t('app.heroTitle2')}</em>
            </h1>

            <p>{t('app.heroDescription')}</p>

            <div className="hero-actions">
              <a
                className="primary-action"
                href="#explorar"
              >
                {t('app.heroExplore')}
                <ArrowUpRight size={17} />
              </a>

              <button
                type="button"
                className="text-action compact-text-button"
                onClick={() => {
                  setShowSources(true);

                  requestAnimationFrame(() =>
                    document
                      .getElementById('fontes')
                      ?.scrollIntoView({
                        behavior: 'smooth',
                      }),
                  );
                }}
              >
                {t('app.heroHow')}
                <BookOpen size={16} />
              </button>
            </div>

            <div className="hero-trust">
              <span>
                <Satellite size={15} />
                {t('app.trustEarth')}
              </span>

              <span>
                <ShieldCheck size={15} />
                {t('app.trustScience')}
              </span>

              <span>
                <HeartPulse size={15} />
                {t('app.trustHealth')}
              </span>
            </div>
          </div>

          <div
            className="hero-visual"
            aria-hidden="true"
          >
            <div className="earth-orbit orbit-one" />
            <div className="earth-orbit orbit-two" />

            <div className="earth-globe">
              <div className="earth-grid" />
              <div className="earth-land land-one" />
              <div className="earth-land land-two" />
              <div className="earth-land land-three" />
              <div className="earth-glow" />
            </div>

            <div className="orbit-label label-top">
              <span />
              {t('app.satelliteData')}
            </div>

            <div className="orbit-label label-bottom">
              <span />
              {t('app.planetaryHealth')}
            </div>
          </div>
        </section>

        {/* EXPLORAÇÃO */}

        <section
          id="explorar"
          className="section-block"
        >
          <div className="section-heading">
            <div>
              <div className="eyebrow">
                {t('app.exploreEyebrow')}
              </div>

              <h2>{t('app.exploreTitle')}</h2>
              <p>{t('app.exploreDescription')}</p>
            </div>

            <div className="section-icon">
              <Globe2 />
            </div>
          </div>

          <div className="explorer-layout">
            <div className="explorer-controls">
              <LocationFilter
                onLocationChange={setLocation}
              />

              <div className="selected-location-card">
                <span className="mini-label">
                  {t('app.selected')}
                </span>

                <strong>{locationName}</strong>
                <small>{coordinates}</small>

                <small>
                  {location?.state?.name
                    ? `${location.state.name}, `
                    : ''}
                  {location?.country?.name ||
                    t('app.noneSelected')}
                </small>
              </div>

              <div className="data-connection">
                <div className="connection-heading">
                  <span
                    className={`status-light ${
                      apiStatus?.configured
                        ? 'online'
                        : 'offline'
                    }`}
                  />

                  <strong>
                    {t('app.connection')}
                  </strong>
                </div>

                <p>
                  {!apiStatus
                    ? t('app.checking')
                    : apiStatus.configured
                      ? t('app.earthdataConfigured')
                      : t('app.earthdataMissing')}
                </p>
              </div>
            </div>

            <div className="map-panel">
              <div className="map-panel-heading">
                <span>
                  <MapPin size={17} />
                  {t('app.mapTitle')}
                </span>

                <small>
                  {t('app.mapProvider')}
                </small>
              </div>

              {location ? (
                <CityMap
                  latitude={location.latitude}
                  longitude={location.longitude}
                  cityName={locationName}
                  countryName={location.country.name}
                  zoom={
                    location.city
                      ? 9
                      : location.state
                        ? 6
                        : 3
                  }
                />
              ) : (
                <div className="map-empty">
                  <Globe2 size={48} />

                  <strong>
                    {t('app.mapStart')}
                  </strong>

                  <span>
                    {t('app.mapHint')}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* DATAS */}

          <div className="compact-dates">
            <label>
              Data inicial

              <input
                type="date"
                value={startDate}
                onChange={(event) =>
                  setStartDate(event.target.value)
                }
              />
            </label>

            <label>
              Data final

              <input
                type="date"
                value={endDate}
                onChange={(event) =>
                  setEndDate(event.target.value)
                }
              />
            </label>

            <small>
              Período utilizado nas consultas
              Giovanni e AppEEARS.
            </small>
          </div>

          {/* NASA GIOVANNI */}

          {/* FILTRO UNIFICADO — GIOVANNI E APPEEARS */}
          <div className="extraction-card giovanni-card">
            <div className="giovanni-intro">
              <div className="eyebrow">NASA GIOVANNI · NASA APPEEARS</div>
              <h3>Consultar temperaturas do ar e da superfície</h3>
              <p>
                Escolha a medição: Giovanni consulta temperatura do ar;
                AppEEARS extrai temperatura da superfície terrestre (MODIS).
              </p>
            </div>

            <div className="extraction-fields">
              <label>
                Tipo de temperatura
                <select
                  value={measurementSource === 'appeears'
                    ? `appeears:${layer}`
                    : `giovanni:${giovanniVariable}`}
                  onChange={(event) => {
                    const selected = event.target.value;
                    if (selected.startsWith('appeears:')) {
                      setMeasurementSource('appeears');
                      setLayer(selected.slice('appeears:'.length));
                    } else {
                      setMeasurementSource('giovanni');
                      setGiovanniVariable(selected.slice('giovanni:'.length));
                    }
                    setGiovanniMessage('');
                    setTaskMessage('');
                    setGiovanniResult('');
                    setGiovanniSummary(null);
                  }}
                >
                  <optgroup label="Temperatura do ar — NASA Giovanni">
                    {!giovanniVariables.length && (
                      <option value="giovanni:" disabled>
                        {giovanniCatalogLoading ? 'Carregando variáveis...' : 'Nenhuma variável disponível'}
                      </option>
                    )}
                    {giovanniVariables.map((item) => (
                      <option value={`giovanni:${item.value}`} key={item.value}>
                        {temperatureName(item.value, i18n.language)} · {item.value}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Temperatura da superfície — NASA AppEEARS">
                    <option value="appeears:LST_Day_1km">Temperatura da superfície · dia</option>
                    <option value="appeears:LST_Night_1km">Temperatura da superfície · noite</option>
                  </optgroup>
                </select>
              </label>

              <small className="compact-variable-hint">
                {measurementSource === 'appeears'
                  ? `Fonte: NASA AppEEARS · MOD11A2.061 · ${layer}`
                  : giovanniVariable
                    ? `Fonte: NASA Giovanni · ${giovanniVariable}`
                    : giovanniCatalogError || 'Aguardando catálogo Giovanni.'}
              </small>

              <button
                type="button"
                className="primary-action"
                onClick={() => {
                  if (measurementSource === 'appeears') void createExtraction();
                  else void queryGiovanni();
                }}
                disabled={!location || (measurementSource === 'appeears'
                  ? taskLoading || Boolean(taskId) && !['done', 'complete', 'completed', 'error', 'failed', 'cancelled', 'canceled'].includes(taskState) || !apiStatus?.configured
                  : giovanniLoading || !giovanniVariable.trim())}
              >
                {measurementSource === 'appeears'
                  ? taskLoading ? 'Enviando extração...' : 'Consultar superfície'
                  : giovanniLoading ? 'Consultando Giovanni...' : 'Consultar temperatura do ar'}
                <ArrowUpRight size={16} />
              </button>
            </div>

            {measurementSource === 'appeears' && (
              <div aria-live="polite">
                {taskMessage && <div className="task-message" role="status">{taskMessage}</div>}
                {taskId && (
                  <div className="task-message" role="status">
                    <strong>Estado da extração AppEEARS:</strong> {taskState || 'Aguardando processamento'}
                    {taskFiles.length > 0 && (
                      <ul>
                        {taskFiles.map((file, index) => (
                          <li key={file.file_id || file.file_name || index}>
                            {file.file_name || file.file_id}
                            {file.file_id && (
                              <button type="button" className="secondary-action"
                                onClick={() => void downloadTaskFile(file)}>
                                <Download size={13} /> Baixar
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}
            {!location && (
              <p
                className="giovanni-location-hint"
                role="status"
              >
                Selecione uma localização para
                habilitar a consulta NASA.
              </p>
            )}

            {measurementSource === 'giovanni' && giovanniMessage && (
              <div
                className="task-message"
                role="status"
                aria-live="polite"
              >
                {giovanniMessage}
              </div>
            )}

            {/* CARDS DE RESULTADOS — AMBAS AS FONTES */}

            {giovanniResult && (
              <section
                className="task-message"
                aria-label="Resultados científicos"
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                    flexWrap: 'wrap',
                    marginBottom: 16,
                  }}
                >
                  <div>
                    <span className="eyebrow">
                      DADOS CIENTÍFICOS
                    </span>

                    <h3>
                      Resultados da consulta
                    </h3>

                    <p>
                      Dados históricos organizados
                      por ano.
                    </p>
                  </div>

                  <button
                    type="button"
                    className="secondary-action"
                    onClick={() =>
                      downloadText(
                        giovanniResult,
                        'ctrlclima-giovanni.txt',
                      )
                    }
                  >
                    <Download size={14} />
                    Baixar dados originais
                  </button>
                </div>

                {giovanniSummary ? (
                  <>
                    {giovanniSummary.notice && <p className="compact-scientific-note">{giovanniSummary.notice}</p>}
                    <div className="compact-summary-meta">
                      <span>
                        <strong>Fonte:</strong>{' '}
                        {giovanniSummary.source}
                      </span>

                      <span>
                        <strong>Local:</strong>{' '}
                        {giovanniSummary.location}
                      </span>

                      <span>
                        <strong>Período:</strong>{' '}
                        {giovanniSummary.period}
                      </span>
                    </div>

                    {(() => {
                      const rows = giovanniSummary.rows;
                      const unit = giovanniSummary.unit;

                      const mean =
                        rows.reduce(
                          (sum, row) =>
                            sum + row.value,
                          0,
                        ) / rows.length;

                      const maximum = rows.reduce(
                        (best, row) =>
                          row.value > best.value
                            ? row
                            : best,
                        rows[0],
                      );

                      const minimum = rows.reduce(
                        (best, row) =>
                          row.value < best.value
                            ? row
                            : best,
                        rows[0],
                      );

                      const delta =
                        rows.length > 1
                          ? rows[rows.length - 1]
                              .value -
                            rows[0].value
                          : null;

                      const stats = [
                        {
                          title: 'Média do período',
                          value: valueLabel(
                            mean,
                            unit,
                          ),
                          description:
                            'Média das médias anuais disponíveis',
                        },
                        {
                          title: 'Maior média anual',
                          value: valueLabel(
                            maximum.value,
                            unit,
                          ),
                          description:
                            `Ano ${maximum.year}`,
                        },
                        {
                          title: 'Menor média anual',
                          value: valueLabel(
                            minimum.value,
                            unit,
                          ),
                          description:
                            `Ano ${minimum.year}`,
                        },
                        {
                          title: 'Mudança no período',
                          value:
                            delta === null
                              ? '—'
                              : `${
                                  delta > 0 ? '+' : ''
                                }${valueLabel(
                                  delta,
                                  unit,
                                )}`,
                          description:
                            `${rows[0].year} → ${
                              rows[rows.length - 1]
                                .year
                            }`,
                        },
                      ];

                      return (
                        <>
                          <div className="compact-metrics">
                            {stats.map((card) => (
                              <article
                                key={card.title}
                                className="compact-metric"
                              >
                                <span>
                                  {card.title}
                                </span>

                                <strong>
                                  {card.value}
                                </strong>

                                <small>
                                  {card.description}
                                </small>
                              </article>
                            ))}
                          </div>

                          <details className="compact-year-details">
                            <summary>
                              Ver comparação anual
                              ({rows.length} anos)
                            </summary>

                            <div className="compact-years">
                              {rows.map(
                                (row, index) => {
                                  const diff = index
                                    ? row.value -
                                      rows[index - 1]
                                        .value
                                    : null;

                                  return (
                                    <article
                                      className="compact-year"
                                      key={row.year}
                                    >
                                      <span>
                                        {row.year}
                                      </span>

                                      <strong>
                                        {valueLabel(
                                          row.value,
                                          unit,
                                        )}
                                      </strong>

                                      <small>
                                        {diff === null
                                          ? 'Primeiro ano'
                                          : `${
                                              diff > 0
                                                ? '+'
                                                : ''
                                            }${valueLabel(
                                              diff,
                                              unit,
                                            )} em relação ao ano anterior`}
                                      </small>
                                    </article>
                                  );
                                },
                              )}
                            </div>
                          </details>

                          <p className="compact-scientific-note">
                            Variável: {giovanniSummary.source === 'NASA AppEEARS'
                              ? giovanniSummary.variable
                              : temperatureName(giovanniSummary.variable, i18n.language)}. Os valores representam
                            médias anuais dos registros
                            disponíveis, não extremos
                            diários absolutos.
                          </p>
                        </>
                      );
                    })()}
                  </>
                ) : (
                  <p>
                    Não foi possível organizar a
                    resposta em médias anuais.
                  </p>
                )}

                <details style={{ marginTop: 16 }}>
                  <summary>
                    Ver resposta técnica original
                  </summary>

                  <pre
                    style={{
                      maxHeight: 260,
                      overflow: 'auto',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {giovanniResult.slice(0, 12000)}
                  </pre>
                </details>
              </section>
            )}
          </div>

        </section>

        {/* SAÚDE */}

        {showHealth && (
          <section
            id="saude"
            className="section-block muted-section compact-secondary-page"
          >
            <div className="section-heading">
              <div>
                <div className="eyebrow">
                  CLIMA E SAÚDE
                </div>

                <h2>Saúde e exposição ao calor</h2>

                <p>
                  Entenda a relação entre temperaturas
                  elevadas e exposição ambiental.
                </p>
              </div>

              <div className="section-icon">
                <HeartPulse />
              </div>
            </div>

            <button
              type="button"
              className="secondary-action compact-close"
              onClick={() =>
                setShowHealth(false)
              }
            >
              Fechar Saúde
            </button>

            <div className="health-grid">
              <article className="health-card">
                <div className="health-icon warm">
                  <Activity />
                </div>

                <h3>Calor intenso</h3>

                <p>
                  Altas temperaturas podem aumentar
                  o estresse térmico e a necessidade
                  de hidratação.
                </p>
              </article>

              <article className="health-card">
                <div className="health-icon green">
                  <Leaf />
                </div>

                <h3>Ambiente urbano</h3>

                <p>
                  Superfícies urbanas podem reter
                  calor e influenciar as condições
                  térmicas locais.
                </p>
              </article>

              <article className="health-card">
                <div className="health-icon blue">
                  <HeartPulse />
                </div>

                <h3>Exposição prolongada</h3>

                <p>
                  A duração do calor é importante
                  para avaliar possíveis impactos
                  sobre a saúde.
                </p>
              </article>

              <article className="health-card">
                <div className="health-icon purple">
                  <ShieldCheck />
                </div>

                <h3>Interpretação científica</h3>

                <p>
                  Os indicadores climáticos ajudam
                  a contextualizar a exposição,
                  mas não diagnosticam doenças.
                </p>
              </article>
            </div>

            <div className="explain-note">
              <Info size={18} />

              <p>
                Dados ambientais não estabelecem,
                isoladamente, relações de causa
                e efeito entre temperatura e doenças.
              </p>
            </div>
          </section>
        )}

        {/* TENDÊNCIAS E PROJEÇÕES */}

        <section
          id="tendencias"
          className="section-block"
        >
          <div className="section-heading">
            <div>
              <div className="eyebrow">
                {t('app.trendEyebrow')}
              </div>

              <h2>
                {t('app.trendTitle')}
              </h2>

              <p>
                {t('app.trendDescription')}
              </p>
            </div>

            <div className="section-icon">
              <ChartNoAxesCombined />
            </div>
          </div>

          <div className="trend-toolbar">
            <div className="tab-switch">
              <button
                type="button"
                className={
                  activeTab === 'observed'
                    ? 'active'
                    : ''
                }
                onClick={() =>
                  setActiveTab('observed')
                }
              >
                Dados históricos
              </button>

              <button
                type="button"
                className={
                  activeTab === 'projection'
                    ? 'active'
                    : ''
                }
                onClick={() =>
                  setActiveTab('projection')
                }
              >
                Projeção de 5 anos
              </button>
            </div>

            <div className="compact-export-actions">
              <label className="upload-button">
                <Download size={15} />

                {t('app.importCsv')}

                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) =>
                    handleCsv(
                      event.target.files?.[0],
                    )
                  }
                />
              </label>

              <button
                type="button"
                className="secondary-action"
                disabled={!reportRows.length}
                onClick={() =>
                  downloadCsv(
                    reportRows,
                    'ctrlclima-relatorio.csv',
                  )
                }
              >
                <Download size={15} />
                CSV
              </button>

              <button
                type="button"
                className="secondary-action"
                disabled={!reportRows.length}
                onClick={() => window.print()}
              >
                <FileDown size={15} />
                PDF
              </button>
            </div>
          </div>

          {/* GRÁFICO HISTÓRICO */}

          {activeTab === 'observed' ? (
            importedRows.length ? (
              <div className="trend-chart-card">
                <div className="chart-title">
                  <div>
                    <h3>Dados históricos observados</h3>

                    <p>
                      {seriesSource} · {seriesVariable} ·
                      {seriesUnit} · {coordinates}
                    </p>
                  </div>
                </div>

                <ResponsiveContainer
                  width="100%"
                  height={290}
                >
                  <AreaChart
                    data={[...importedRows].sort(
                      (a, b) =>
                        Number(a.year) -
                        Number(b.year),
                    )}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#294252"
                    />

                    <XAxis
                      dataKey="year"
                      stroke="#91a6b5"
                    />

                    <YAxis stroke="#91a6b5" />

                    <Tooltip
                      contentStyle={{
                        background: '#102536',
                        border:
                          '1px solid #29485a',
                        borderRadius: 10,
                      }}
                    />

                    <Area
                      type="monotone"
                      dataKey="value"
                      name="Observado"
                      stroke="#35c6b0"
                      fill="#35c6b0"
                      fillOpacity={0.15}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="trend-empty">
                <ChartNoAxesCombined size={32} />

                <h3>
                  {t('app.trendEmptyTitle')}
                </h3>

                <p>
                  {t('app.trendEmpty')}
                </p>
              </div>
            )
          ) : (
            /* GRÁFICO DA PROJEÇÃO */

            <div className="trend-chart-card">
              <div className="chart-title">
                <div>
                  <h3>
                    Projeção da tendência para
                    cinco anos
                  </h3>

                  <p>
                    Regressão linear dos dados
                    históricos anuais.
                  </p>
                </div>

                <span className="method-pill">
                  Regressão linear
                </span>
              </div>

              {trend.length ? (
                <ResponsiveContainer
                  width="100%"
                  height={290}
                >
                  <AreaChart data={trend}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#294252"
                    />

                    <XAxis
                      dataKey="year"
                      stroke="#91a6b5"
                    />

                    <YAxis stroke="#91a6b5" />

                    <Tooltip
                      contentStyle={{
                        background: '#102536',
                        border:
                          '1px solid #29485a',
                        borderRadius: 10,
                      }}
                    />

                    <Area
                      type="monotone"
                      dataKey="observed"
                      name="Dados observados"
                      stroke="#35c6b0"
                      fill="#35c6b0"
                      fillOpacity={0.15}
                      connectNulls={false}
                    />

                    <Area
                      type="monotone"
                      dataKey="projected"
                      name="Projeção"
                      stroke="#e4d49a"
                      strokeDasharray="6 5"
                      fill="none"
                      connectNulls={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="trend-empty compact">
                  <p>
                    São necessários pelo menos
                    três anos com dados válidos
                    para gerar a projeção.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* CARDS DA PROJEÇÃO */}

          {activeTab === 'projection' &&
            projectionSummary && (
              <div
                className="statistics-panel"
                aria-live="polite"
              >
                <div className="statistics-heading">
                  <div>
                    <span className="eyebrow">
                      PROJEÇÃO DE CINCO ANOS
                    </span>

                    <h3>
                      Tendência estimada de{' '}
                      {projectionSummary.startYear}
                      {' '}a{' '}
                      {projectionSummary.endYear}
                    </h3>
                  </div>

                  <span className="method-pill">
                    Regressão linear
                  </span>
                </div>

                <div className="statistics-grid">
                  <article>
                    <span>
                      Primeiro ano projetado
                    </span>

                    <strong>
                      {projectionSummary.startYear}
                    </strong>

                    <small>
                      {valueLabel(
                        projectionSummary.startValue,
                        seriesUnit,
                      )}
                    </small>
                  </article>

                  <article>
                    <span>
                      Quinto ano projetado
                    </span>

                    <strong>
                      {projectionSummary.endYear}
                    </strong>

                    <small>
                      {valueLabel(
                        projectionSummary.endValue,
                        seriesUnit,
                      )}
                    </small>
                  </article>

                  <article>
                    <span>
                      Variação estimada
                    </span>

                    <strong>
                      {projectionSummary.change > 0
                        ? '+'
                        : ''}
                      {valueLabel(
                        projectionSummary.change,
                        seriesUnit,
                      )}
                    </strong>

                    <small>
                      Em relação ao último
                      ano observado (
                      {projectionSummary.lastObservedYear}
                      )
                    </small>
                  </article>

                  <article>
                    <span>
                      Direção da tendência
                    </span>

                    <strong>
                      {projectionSummary.change > 0
                        ? 'Aumento'
                        : projectionSummary.change < 0
                          ? 'Redução'
                          : 'Estável'}
                    </strong>

                    <small>
                      Modelo baseado em{' '}
                      {projectionSummary.count}
                      {' '}médias anuais
                    </small>
                  </article>
                </div>

                <p className="statistics-footnote">
                  Esta projeção é uma extrapolação
                  estatística exploratória.
                  Não representa uma previsão
                  meteorológica oficial NASA.
                  Séries curtas ou incompletas
                  aumentam a incerteza.
                </p>
              </div>
            )}

          {/* ESTATÍSTICAS CIENTÍFICAS */}

          {trendStatistics && (
            <div
              className="statistics-panel"
              aria-live="polite"
            >
              <div className="statistics-heading">
                <div>
                  <span className="eyebrow">
                    {t('app.statisticsEyebrow')}
                  </span>

                  <h3>
                    {t('app.statisticsTitle')}
                  </h3>
                </div>

                <span className="method-pill">
                  {t('app.mannKendallSen')}
                </span>
              </div>

              <div className="statistics-grid">
                <article>
                  <span>
                    {t('app.senSlope')}
                  </span>

                  <strong>
                    {trendStatistics.senSlope.toFixed(4)}
                  </strong>

                  <small>
                    {t('app.perYear', {
                      unit: seriesUnit,
                    })}
                  </small>
                </article>

                <article>
                  <span>
                    {t('app.olsSlope')}
                  </span>

                  <strong>
                    {trendStatistics.olsSlope.toFixed(4)}
                  </strong>

                  <small>
                    {t('app.perYear', {
                      unit: seriesUnit,
                    })}
                  </small>
                </article>

                <article>
                  <span>
                    {t('app.confidenceInterval')}
                  </span>

                  <strong>
                    {trendStatistics.senSlopeCiLow.toFixed(3)}
                    {' – '}
                    {trendStatistics.senSlopeCiHigh.toFixed(3)}
                  </strong>

                  <small>
                    {t('app.senCiNote')}
                  </small>
                </article>

                <article>
                  <span>
                    {t('app.mannKendallP')}
                  </span>

                  <strong>
                    {trendStatistics.mannKendallP.toFixed(4)}
                  </strong>

                  <small>
                    {trendStatistics.significantAt05
                      ? t('app.significant')
                      : t('app.notSignificant')}
                  </small>
                </article>
              </div>

              <p className="statistics-footnote">
                {t('app.statisticsCaveat', {
                  count: trendStatistics.count,
                  first: trendStatistics.firstYear,
                  last: trendStatistics.lastYear,
                })}
              </p>
            </div>
          )}

          <div className="method-disclaimer">
            <TrendingUp size={17} />

            <span>
              Os dados históricos são provenientes
              da fonte identificada. A projeção
              de cinco anos é um cálculo estatístico
              desenvolvido pelo CTRLClima.
            </span>
          </div>
        </section>

        {/* FONTES E METODOLOGIA */}

        {showSources && (
          <section
            id="fontes"
            className="section-block compact-secondary-page"
          >
            <div className="section-heading">
              <div>
                <div className="eyebrow">
                  TRANSPARÊNCIA CIENTÍFICA
                </div>

                <h2>Fontes e metodologia</h2>

                <p>
                  Conheça a origem dos dados e
                  a diferença entre observação
                  e projeção.
                </p>
              </div>

              <div className="section-icon">
                <Microscope />
              </div>
            </div>

            <button
              type="button"
              className="secondary-action compact-close"
              onClick={() =>
                setShowSources(false)
              }
            >
              Fechar fontes
            </button>

            <div className="statistics-panel">
              <div className="statistics-heading">
                <div>
                  <span className="eyebrow">
                    ORIGEM DOS DADOS
                  </span>

                  <h3>
                    Como o CTRLClima funciona
                  </h3>
                </div>

                <span className="method-pill">
                  Resumo
                </span>
              </div>

              <div className="statistics-grid">
                <article>
                  <span>
                    NASA Giovanni
                  </span>

                  <strong>
                    Séries temporais
                  </strong>

                  <small>
                    Consulta variáveis climáticas
                    e organiza os registros
                    históricos por ano.
                  </small>
                </article>

                <article>
                  <span>
                    NASA AppEEARS
                  </span>

                  <strong>
                    Temperatura da superfície
                  </strong>

                  <small>
                    Extrai produtos MODIS de
                    temperatura da superfície
                    terrestre (LST).
                  </small>
                </article>

                <article>
                  <span>
                    Dados históricos
                  </span>

                  <strong>
                    Dados NASA
                  </strong>

                  <small>
                    Valores retornados pelas APIs
                    e apresentados com identificação
                    da fonte utilizada.
                  </small>
                </article>

                <article>
                  <span>
                    Tendência futura
                  </span>

                  <strong>
                    Projeção de 5 anos
                  </strong>

                  <small>
                    Cálculo matemático do CTRLClima,
                    não uma previsão oficial NASA.
                  </small>
                </article>
              </div>

              <p className="statistics-footnote">
                Temperatura do ar e temperatura
                da superfície terrestre são medidas
                diferentes. Os máximos e mínimos
                apresentados nos cards históricos
                correspondem a médias anuais.
              </p>
            </div>

            <details
              className="compact-methodology"
              id="metodologia"
            >
              <summary>
                <BookOpen size={16} />
                Ver detalhes da metodologia
              </summary>

              <p>
                <strong>NASA Giovanni:</strong>
                {' '}consulta séries temporais
                científicas de temperatura do ar.
              </p>

              <p>
                <strong>NASA AppEEARS:</strong>
                {' '}permite extrair produtos
                orbitais MODIS de temperatura
                da superfície.
              </p>

              <p>
                <strong>Médias anuais:</strong>
                {' '}são calculadas com os
                registros válidos disponíveis.
              </p>

              <p>
                <strong>Projeção:</strong>
                {' '}utiliza regressão linear
                para extrapolar a tendência
                dos próximos cinco anos.
              </p>

              <p>
                Referências:{' '}
                <a
                  href="https://giovanni.gsfc.nasa.gov/giovanni/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Giovanni
                </a>
                {' · '}
                <a
                  href="https://appeears.earthdatacloud.nasa.gov/"
                  target="_blank"
                  rel="noreferrer"
                >
                  AppEEARS
                </a>
              </p>
            </details>
          </section>
        )}
      </main>

      <footer className="site-footer">
        <a
          className="brand"
          href="#inicio"
        >
          <span className="brand-mark">
            <Globe2 size={20} />
          </span>

          <span>
            <strong>
              CTRL<span>Clima</span>
            </strong>

            <small>
              {t('app.brandTag')}
            </small>
          </span>
        </a>

        <p>{t('app.footer')}</p>

        <span>
          {t('app.sourcesLine')}
        </span>
      </footer>
    </div>
  );
}
