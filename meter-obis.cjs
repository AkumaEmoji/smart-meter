const OBIS_FIELDS = {
    power: {
        codes: ['1-0:16.7.0'],
        unit: 'W',
        label: 'Total active power'
    },
    importKwh: {
        codes: ['1-0:1.8.0'],
        unit: 'kWh',
        label: 'Imported energy total',
        minimum: 0
    },
    exportKwh: {
        codes: ['1-0:2.8.0'],
        unit: 'kWh',
        label: 'Exported energy total',
        minimum: 0
    },
    phasePowerL1: {
        codes: ['1-0:36.7.0'],
        unit: 'W',
        label: 'Active power L1'
    },
    phasePowerL2: {
        codes: ['1-0:56.7.0'],
        unit: 'W',
        label: 'Active power L2'
    },
    phasePowerL3: {
        codes: ['1-0:76.7.0'],
        unit: 'W',
        label: 'Active power L3'
    },
    voltageL1: {
        codes: ['1-0:32.7.0'],
        unit: 'V',
        label: 'Voltage L1',
        minimum: 0
    },
    voltageL2: {
        codes: ['1-0:52.7.0'],
        unit: 'V',
        label: 'Voltage L2',
        minimum: 0
    },
    voltageL3: {
        codes: ['1-0:72.7.0'],
        unit: 'V',
        label: 'Voltage L3',
        minimum: 0
    },
    currentL1: {
        codes: ['1-0:31.7.0'],
        unit: 'A',
        label: 'Current L1',
        minimum: 0
    },
    currentL2: {
        codes: ['1-0:51.7.0'],
        unit: 'A',
        label: 'Current L2',
        minimum: 0
    },
    currentL3: {
        codes: ['1-0:71.7.0'],
        unit: 'A',
        label: 'Current L3',
        minimum: 0
    },
    frequencyHz: {
        codes: ['1-0:14.7.0'],
        unit: 'Hz',
        label: 'Grid frequency',
        minimum: 0
    }
};

function canonicalObisCode(code) {
    if (typeof code !== 'string') {
        return '';
    }

    return code.trim().replace(/\*(?:0|255)$/, '');
}

function entryCode(entry, fallback = '') {
    if (entry && typeof entry.idToString === 'function') {
        return entry.idToString();
    }

    return fallback;
}

function entryValues(entry) {
    if (!entry) {
        return [];
    }

    if (typeof entry.getValues === 'function') {
        const values = entry.getValues();
        return Array.isArray(values) ? values : [];
    }

    if (typeof entry.getValue === 'function') {
        const value = entry.getValue();
        return value === null || value === undefined ? [] : [value];
    }

    if (Array.isArray(entry.values)) {
        return entry.values;
    }

    return [];
}

function safeValue(value) {
    if (Buffer.isBuffer(value)) {
        return value.toString('hex');
    }

    if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean' || value === null) {
        return value;
    }

    return String(value);
}

function serializeMeasurement(entry) {
    return entryValues(entry).map((measurement) => ({
        value: safeValue(measurement?.value ?? measurement),
        unit: typeof measurement?.unit === 'string' && measurement.unit
            ? measurement.unit
            : null
    }));
}

function indexEntries(obisResult) {
    const indexed = new Map();

    for (const [fallbackCode, entry] of Object.entries(obisResult || {})) {
        const code = entryCode(entry, fallbackCode);
        const canonicalCode = canonicalObisCode(code);
        if (canonicalCode && !indexed.has(canonicalCode)) {
            indexed.set(canonicalCode, { code, entry });
        }
    }

    return indexed;
}

function readField(indexedEntries, definition, fieldName, warnings) {
    const match = definition.codes
        .map((code) => indexedEntries.get(canonicalObisCode(code)))
        .find(Boolean);

    if (!match) {
        return { value: null, match: null };
    }

    const measurement = serializeMeasurement(match.entry)[0];
    if (!measurement) {
        warnings.push(`${fieldName}: ${match.code} did not contain a value`);
        return { value: null, match };
    }

    const value = Number(measurement.value);
    if (!Number.isFinite(value)) {
        warnings.push(`${fieldName}: ${match.code} was not numeric`);
        return { value: null, match };
    }

    if (measurement.unit && measurement.unit !== definition.unit) {
        warnings.push(
            `${fieldName}: expected ${definition.unit} from ${match.code}, received ${measurement.unit}`
        );
        return { value: null, match };
    }

    if (definition.minimum !== undefined && value < definition.minimum) {
        warnings.push(`${fieldName}: ${match.code} was below ${definition.minimum}`);
        return { value: null, match };
    }

    return { value, match };
}

function datasetFor(reading) {
    const richerValues = [
        ...Object.values(reading.phasePowerW),
        ...Object.values(reading.voltageV),
        ...Object.values(reading.currentA),
        reading.frequencyHz
    ];

    if (richerValues.some((value) => value !== null)) {
        return 'manufacturer-specific';
    }
    if (reading.power !== null) {
        return 'complete';
    }
    if (reading.importKwh !== null || reading.exportKwh !== null) {
        return 'reduced';
    }
    return 'unknown';
}

function extractMeterReading(obisResult) {
    const indexedEntries = indexEntries(obisResult);
    const warnings = [];
    const extracted = {};
    const matchedEntries = new Map();

    for (const [fieldName, definition] of Object.entries(OBIS_FIELDS)) {
        const field = readField(indexedEntries, definition, fieldName, warnings);
        extracted[fieldName] = field.value;
        if (field.match) {
            matchedEntries.set(field.match.code, {
                entry: field.match.entry,
                definition
            });
        }
    }

    const rawObis = {};
    for (const [code, { entry, definition }] of matchedEntries) {
        const measurement = serializeMeasurement(entry)[0];
        if (!measurement) {
            continue;
        }
        rawObis[code] = {
            value: measurement.value,
            unit: measurement.unit,
            label: definition.label
        };
    }

    const reading = {
        power: extracted.power,
        importKwh: extracted.importKwh,
        exportKwh: extracted.exportKwh,
        phasePowerW: {
            l1: extracted.phasePowerL1,
            l2: extracted.phasePowerL2,
            l3: extracted.phasePowerL3
        },
        voltageV: {
            l1: extracted.voltageL1,
            l2: extracted.voltageL2,
            l3: extracted.voltageL3
        },
        currentA: {
            l1: extracted.currentL1,
            l2: extracted.currentL2,
            l3: extracted.currentL3
        },
        frequencyHz: extracted.frequencyHz,
        rawObis: Object.keys(rawObis).length > 0 ? rawObis : null
    };

    return {
        reading,
        meterDataset: datasetFor(reading),
        warnings
    };
}

function serializeObisResult(obisResult) {
    const output = {};

    for (const [fallbackCode, entry] of Object.entries(obisResult || {})) {
        output[entryCode(entry, fallbackCode)] = serializeMeasurement(entry);
    }

    return output;
}

module.exports = {
    OBIS_FIELDS,
    canonicalObisCode,
    extractMeterReading,
    serializeObisResult
};
