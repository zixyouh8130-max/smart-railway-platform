import React, {
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  AlertCircle,
  CheckCircle,
  Info,
  Loader,
  RotateCcw,
  Save,
  Train,
  X,
} from 'lucide-react';

import Button from '@/components/ui/button';
import feesApi from '@/api/fees';
import routesApi from '@/api/routes';
import trainsApi from '@/api/trains';


const extractErrorMessage = (error) => {
  if (!error) {
    return 'An unexpected error occurred';
  }

  if (typeof error === 'string') {
    return error;
  }

  if (Array.isArray(error)) {
    return error
      .map((item) => {
        const field =
          item.loc?.join('.') || '';

        const message =
          item.msg ||
          'Validation error';

        return field
          ? `${field}: ${message}`
          : message;
      })
      .join('; ');
  }

  if (error.detail) {
    if (Array.isArray(error.detail)) {
      return extractErrorMessage(
        error.detail
      );
    }

    if (
      typeof error.detail ===
      'string'
    ) {
      return error.detail;
    }
  }

  return (
    error.message ||
    'An unexpected error occurred'
  );
};


const emptyMatrix = (
  stations,
  classType
) => {
  const matrix = {};

  for (
    let fromIndex = 0;
    fromIndex < stations.length;
    fromIndex += 1
  ) {
    for (
      let toIndex =
        fromIndex + 1;
      toIndex < stations.length;
      toIndex += 1
    ) {
      const from =
        stations[fromIndex];

      const to =
        stations[toIndex];

      const distance =
        from.distance_from_origin
          !== null &&
        from.distance_from_origin
          !== undefined &&
        to.distance_from_origin
          !== null &&
        to.distance_from_origin
          !== undefined
          ? Math.abs(
              Number(
                to.distance_from_origin
              ) -
              Number(
                from.distance_from_origin
              )
            )
          : null;

      matrix[
        `${from.id}-${to.id}`
      ] = {
        fromId: from.id,
        toId: to.id,
        classType,
        fare: 0,
        baseFare: 0,
        perMileRate: 0,
        surchargePercentage: 0,
        calculatedDistance:
          distance,
        dirty: false,
      };
    }
  }

  return matrix;
};


const FeeConfigurationModal = ({
  isOpen,
  onClose,
  routeId,
}) => {
  const [trains, setTrains] =
    useState([]);

  const [
    selectedTrainId,
    setSelectedTrainId,
  ] = useState(null);

  const [stations, setStations] =
    useState([]);

  const [
    fareCoachTypes,
    setFareCoachTypes,
  ] = useState([]);

  const [
    selectedClassType,
    setSelectedClassType,
  ] = useState('');

  const [fareMatrix, setFareMatrix] =
    useState({});

  const [
    generationConfig,
    setGenerationConfig,
  ] = useState({
    baseFare: 0,
    perMileRate: '',
    surchargePercentage: 0,
  });

  const [loading, setLoading] =
    useState(false);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState(null);

  const [success, setSuccess] =
    useState(null);

  const selectedTrain = useMemo(
    () =>
      trains.find(
        (train) =>
          Number(train.id) ===
          Number(selectedTrainId)
      ) || null,
    [trains, selectedTrainId]
  );

  const selectedCoachClass =
    useMemo(
      () =>
        fareCoachTypes.find(
          (item) =>
            item.class_type ===
            selectedClassType
        ) || null,
      [
        fareCoachTypes,
        selectedClassType,
      ]
    );

  const totalFarePairs =
    useMemo(
      () =>
        (stations.length *
          (stations.length - 1)) /
        2,
      [stations]
    );

  const filledFarePairs =
    useMemo(
      () =>
        Object.values(
          fareMatrix
        ).filter(
          (entry) =>
            Number(entry.fare) > 0
        ).length,
      [fareMatrix]
    );

  useEffect(() => {
    if (!isOpen || !routeId) {
      return;
    }

    const loadTrains = async () => {
      setLoading(true);
      setError(null);

      try {
        const response =
          await trainsApi.getByRoute(
            routeId
          );

        const list =
          response.trains ||
          response.data?.trains ||
          [];

        setTrains(list);

        setSelectedTrainId(
          list.length
            ? list[0].id
            : null
        );
      } catch (err) {
        setError(
          extractErrorMessage(err)
        );
      } finally {
        setLoading(false);
      }
    };

    loadTrains();
  }, [isOpen, routeId]);

  useEffect(() => {
    if (!selectedTrainId) {
      setStations([]);
      setFareCoachTypes([]);
      setSelectedClassType('');
      setFareMatrix({});
      return;
    }

    const loadTrainFareSetup =
      async () => {
        setLoading(true);
        setError(null);
        setSuccess(null);

        try {
          const [
            routeResponse,
            coachTypeResponse,
          ] = await Promise.all([
            routesApi.getById(
              routeId
            ),
            feesApi.getFareCoachTypes(
              selectedTrainId
            ),
          ]);

          const routeData =
            routeResponse.data ||
            routeResponse;

          const routeStations =
            [
              ...(
                routeData.stations ||
                routeData.route_stations ||
                []
              ),
            ].sort(
              (a, b) =>
                Number(
                  a.order_number ||
                  a.stop_order ||
                  a.sequence ||
                  0
                ) -
                Number(
                  b.order_number ||
                  b.stop_order ||
                  b.sequence ||
                  0
                )
            );

          const coachTypes =
            coachTypeResponse
              .coach_types || [];

          setStations(
            routeStations
          );

          setFareCoachTypes(
            coachTypes
          );

          setSelectedClassType(
            coachTypes[0]
              ?.class_type || ''
          );
        } catch (err) {
          setError(
            extractErrorMessage(err)
          );
        } finally {
          setLoading(false);
        }
      };

    loadTrainFareSetup();
  }, [
    selectedTrainId,
    routeId,
  ]);

  useEffect(() => {
    if (
      !selectedTrainId ||
      !selectedClassType ||
      stations.length < 2
    ) {
      setFareMatrix({});
      return;
    }

    const loadClassMatrix =
      async () => {
        setLoading(true);
        setError(null);

        const matrix =
          emptyMatrix(
            stations,
            selectedClassType
          );

        try {
          const response =
            await feesApi.getFeeRules(
              selectedTrainId,
              {
                class_type:
                  selectedClassType,
              }
            );

          const rules =
            Array.isArray(response)
              ? response
              : response.rules || [];

          for (const rule of rules) {
            const key =
              `${rule.from_station_id}` +
              `-${rule.to_station_id}`;

            if (!matrix[key]) {
              continue;
            }

            const baseFare =
              Number(
                rule.base_fare || 0
              );

            const perMileRate =
              Number(
                rule.per_mile_rate || 0
              );

            const distance =
              rule.calculated_distance
                ?? matrix[key]
                  .calculatedDistance;

            const surcharge =
              Number(
                rule
                  .surcharge_percentage
                || 0
              );

            const subtotal =
              baseFare +
              perMileRate *
                Number(
                  distance || 0
                );

            const fare =
              subtotal +
              subtotal *
                surcharge /
                100;

            matrix[key] = {
              ...matrix[key],
              fare,
              baseFare,
              perMileRate,
              surchargePercentage:
                surcharge,
              calculatedDistance:
                distance,
              dirty: false,
            };
          }

          setFareMatrix(
            matrix
          );
        } catch (err) {
          setFareMatrix(
            matrix
          );

          setError(
            extractErrorMessage(err)
          );
        } finally {
          setLoading(false);
        }
      };

    loadClassMatrix();
  }, [
    selectedTrainId,
    selectedClassType,
    stations,
  ]);

  const getStationName = (
    station
  ) =>
    station?.station_name ||
    station?.name ||
    'Unknown Station';

  const handleFareChange = (
    fromId,
    toId,
    value
  ) => {
    const key =
      `${fromId}-${toId}`;

    const fare =
      Number(value) || 0;

    setFareMatrix(
      (previous) => ({
        ...previous,
        [key]: {
          ...previous[key],
          fare,
          baseFare: fare,
          perMileRate: 0,
          surchargePercentage: 0,
          dirty: true,
        },
      })
    );
  };

  const handleGenerateFees =
    async () => {
      if (
        !selectedTrainId ||
        !selectedClassType
      ) {
        return;
      }

      const perMileRate =
        Number(
          generationConfig
            .perMileRate
        );

      if (
        !Number.isFinite(
          perMileRate
        ) ||
        perMileRate <= 0
      ) {
        setError(
          'Enter a per-mile rate greater than 0.'
        );

        return;
      }

      setSaving(true);
      setError(null);
      setSuccess(null);

      try {
        const result =
          await feesApi
            .generateFeeRules(
              selectedTrainId,
              {
                base_fare:
                  Number(
                    generationConfig
                      .baseFare
                    || 0
                  ),
                per_mile_rate:
                  perMileRate,
                class_type:
                  selectedClassType,
                surcharge_percentage:
                  Number(
                    generationConfig
                      .surchargePercentage
                    || 0
                  ),
                overwrite_existing:
                  false,
              }
            );

        const changed =
          Number(
            result.created || 0
          ) +
          Number(
            result.updated || 0
          );

        setSuccess(
          changed > 0
            ? `Generated ${changed} ${selectedClassType} fare rules.`
            : `No rules changed (${result.skipped || 0} skipped).`
        );

        const response =
          await feesApi
            .getFeeRules(
              selectedTrainId,
              {
                class_type:
                  selectedClassType,
              }
            );

        const rules =
          Array.isArray(response)
            ? response
            : response.rules || [];

        const matrix =
          emptyMatrix(
            stations,
            selectedClassType
          );

        for (const rule of rules) {
          const key =
            `${rule.from_station_id}` +
            `-${rule.to_station_id}`;

          if (!matrix[key]) {
            continue;
          }

          const baseFare =
            Number(
              rule.base_fare || 0
            );

          const rate =
            Number(
              rule.per_mile_rate || 0
            );

          const distance =
            rule.calculated_distance
              ?? matrix[key]
                .calculatedDistance;

          const surcharge =
            Number(
              rule
                .surcharge_percentage
              || 0
            );

          const subtotal =
            baseFare +
            rate *
              Number(
                distance || 0
              );

          matrix[key] = {
            ...matrix[key],
            fare:
              subtotal +
              subtotal *
                surcharge /
                100,
            baseFare,
            perMileRate: rate,
            surchargePercentage:
              surcharge,
            calculatedDistance:
              distance,
            dirty: false,
          };
        }

        setFareMatrix(
          matrix
        );
      } catch (err) {
        setError(
          extractErrorMessage(err)
        );
      } finally {
        setSaving(false);
      }
    };

  const handleSaveConfiguration =
    async () => {
      if (
        !selectedTrainId ||
        !selectedClassType
      ) {
        return;
      }

      const rules =
        Object.values(
          fareMatrix
        )
          .filter(
            (entry) =>
              Number(entry.fare) > 0
          )
          .map(
            (entry) => ({
              train_id:
                selectedTrainId,
              route_id:
                routeId,
              from_station_id:
                entry.fromId,
              to_station_id:
                entry.toId,

              base_fare:
                entry.dirty
                  ? Number(
                      entry.fare
                    )
                  : Number(
                      entry.baseFare
                      ?? entry.fare
                    ),

              per_mile_rate:
                entry.dirty
                  ? 0
                  : Number(
                      entry.perMileRate
                      || 0
                    ),

              class_type:
                selectedClassType,

              seat_type: null,

              calculated_distance:
                entry
                  .calculatedDistance,

              surcharge_percentage:
                entry.dirty
                  ? 0
                  : Number(
                      entry
                        .surchargePercentage
                      || 0
                    ),

              is_active: true,
            })
          );

      if (!rules.length) {
        setError(
          'Set at least one fare before saving.'
        );

        return;
      }

      setSaving(true);
      setError(null);
      setSuccess(null);

      try {
        await feesApi
          .bulkUpdateFeeRules(
            selectedTrainId,
            { rules }
          );

        setSuccess(
          `Saved ${rules.length} ` +
          `${selectedClassType} fare rules.`
        );

        setFareMatrix(
          (previous) =>
            Object.fromEntries(
              Object.entries(
                previous
              ).map(
                ([key, entry]) => [
                  key,
                  {
                    ...entry,
                    dirty: false,
                  },
                ]
              )
            )
        );
      } catch (err) {
        setError(
          extractErrorMessage(err)
        );
      } finally {
        setSaving(false);
      }
    };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-7xl max-h-[95vh] overflow-y-auto">
        <div className="sticky top-0 bg-white z-30 flex items-center justify-between gap-4 p-5 border-b">
          <div>
            <h2 className="text-xl font-bold">
              Fee Configuration
            </h2>

            <p className="text-sm text-gray-500">
              Configure fares by the passenger coach types actually installed on each train.
              Upper Class is the premium/highest class and cannot be priced below Economy or Sleeper for the same journey.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {trains.length > 0 && (
              <select
                value={
                  selectedTrainId ||
                  ''
                }
                onChange={(event) => {
                  setSelectedTrainId(
                    Number(
                      event.target.value
                    )
                  );

                  setFareMatrix({});
                  setSuccess(null);
                  setError(null);
                }}
                className="border rounded-lg px-3 py-2"
              >
                {trains.map(
                  (train) => (
                    <option
                      key={train.id}
                      value={train.id}
                    >
                      {train.train_no}
                      {' - '}
                      {train.train_name}
                    </option>
                  )
                )}
              </select>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-red-700">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-start gap-2 text-green-700">
              <CheckCircle className="w-5 h-5 shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {loading && (
            <div className="py-10 flex justify-center">
              <Loader className="w-7 h-7 animate-spin" />
            </div>
          )}

          {!loading &&
            selectedTrainId &&
            fareCoachTypes.length ===
              0 && (
              <div className="p-5 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <Info className="w-5 h-5 text-amber-600 shrink-0" />

                  <div>
                    <p className="font-medium text-amber-800">
                      No fare-bearing passenger coaches
                    </p>

                    <p className="text-sm text-amber-700 mt-1">
                      Add Upper Class, Economy Class, or Sleeper coaches to this train first.
                      Dining and baggage/goods coaches are intentionally excluded.
                    </p>
                  </div>
                </div>
              </div>
            )}

          {!loading &&
            fareCoachTypes.length > 0 && (
              <>
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Train className="w-4 h-4 text-indigo-600" />

                    <span className="font-medium">
                      Passenger coach fare
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {fareCoachTypes.map(
                      (item) => {
                        const selected =
                          item.class_type ===
                          selectedClassType;

                        return (
                          <button
                            type="button"
                            key={
                              item.class_type
                            }
                            onClick={() => {
                              setSelectedClassType(
                                item.class_type
                              );

                              setSuccess(
                                null
                              );

                              setError(
                                null
                              );
                            }}
                            className={
                              `px-4 py-2 rounded-lg border text-sm font-medium transition ${
                                selected
                                  ? 'bg-indigo-600 text-white border-indigo-600'
                                  : 'bg-white text-gray-700 border-gray-300 hover:border-indigo-400'
                              }`
                            }
                          >
                            {item.display_name}
                            {' · '}
                            {item.coach_count}
                            {' coach'}
                            {item.coach_count !== 1
                              ? 'es'
                              : ''}
                          </button>
                        );
                      }
                    )}
                  </div>

                  {selectedCoachClass && (
                    <p className="text-xs text-gray-500 mt-2">
                      {selectedCoachClass.total_seats}
                      {' passenger seats · source coach types: '}
                      {selectedCoachClass.source_coach_types.join(', ')}
                    </p>
                  )}
                </div>

                <div className="p-4 rounded-lg border bg-purple-50 border-purple-200">
                  <h3 className="font-semibold text-purple-900 mb-3">
                    Generate {selectedCoachClass?.display_name || selectedClassType} fares from base + mile
                  </h3>

                  <div className="grid sm:grid-cols-4 gap-3 items-end">
                    <label className="text-sm">
                      <span className="block mb-1">
                        Base fee
                      </span>

                      <input
                        type="number"
                        min="0"
                        value={
                          generationConfig.baseFare
                        }
                        onChange={(event) =>
                          setGenerationConfig(
                            (previous) => ({
                              ...previous,
                              baseFare:
                                event
                                  .target
                                  .value,
                            })
                          )
                        }
                        className="w-full border rounded px-3 py-2 bg-white"
                      />
                    </label>

                    <label className="text-sm">
                      <span className="block mb-1">
                        Per-mile rate
                      </span>

                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={
                          generationConfig.perMileRate
                        }
                        onChange={(event) =>
                          setGenerationConfig(
                            (previous) => ({
                              ...previous,
                              perMileRate:
                                event
                                  .target
                                  .value,
                            })
                          )
                        }
                        className="w-full border rounded px-3 py-2 bg-white"
                        placeholder="Required"
                      />
                    </label>

                    <label className="text-sm">
                      <span className="block mb-1">
                        Surcharge %
                      </span>

                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={
                          generationConfig
                            .surchargePercentage
                        }
                        onChange={(event) =>
                          setGenerationConfig(
                            (previous) => ({
                              ...previous,
                              surchargePercentage:
                                event
                                  .target
                                  .value,
                            })
                          )
                        }
                        className="w-full border rounded px-3 py-2 bg-white"
                      />
                    </label>

                    <Button
                      type="button"
                      disabled={saving}
                      onClick={
                        handleGenerateFees
                      }
                    >
                      {saving ? (
                        <Loader className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <RotateCcw className="w-4 h-4 mr-2" />
                      )}

                      Generate
                    </Button>
                  </div>
                </div>

                {stations.length >= 2 ? (
                  <div className="border rounded-xl overflow-hidden">
                    <div className="p-3 bg-gray-50 border-b flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold">
                          {selectedCoachClass?.display_name || selectedClassType}
                          {' fare matrix'}
                        </h3>

                        <p className="text-xs text-gray-500">
                          Manual input saves an exact fare for that station pair.
                        </p>
                      </div>

                      <span className="text-sm text-gray-600">
                        {filledFarePairs}/{totalFarePairs}
                        {' configured'}
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr>
                            <th className="sticky left-0 bg-gray-100 z-10 min-w-[170px] p-3 text-left border-b">
                              From ↓ / To →
                            </th>

                            {stations.map(
                              (station) => (
                                <th
                                  key={station.id}
                                  className="bg-gray-100 min-w-[150px] p-3 border-b text-sm"
                                >
                                  {getStationName(
                                    station
                                  )}

                                  <div className="text-xs text-gray-500 font-normal">
                                    {station.distance_from_origin ?? '?'}
                                    {' mi'}
                                  </div>
                                </th>
                              )
                            )}
                          </tr>
                        </thead>

                        <tbody>
                          {stations.map(
                            (
                              fromStation,
                              fromIndex
                            ) => (
                              <tr
                                key={
                                  fromStation.id
                                }
                              >
                                <td className="sticky left-0 bg-white z-10 p-3 border-b border-r font-medium">
                                  {getStationName(
                                    fromStation
                                  )}
                                </td>

                                {stations.map(
                                  (
                                    toStation,
                                    toIndex
                                  ) => {
                                    if (
                                      fromIndex ===
                                      toIndex
                                    ) {
                                      return (
                                        <td
                                          key={toStation.id}
                                          className="text-center bg-gray-100 border-b p-3 text-gray-400"
                                        >
                                          —
                                        </td>
                                      );
                                    }

                                    if (
                                      fromIndex >
                                      toIndex
                                    ) {
                                      const reverse =
                                        fareMatrix[
                                          `${toStation.id}-${fromStation.id}`
                                        ];

                                      return (
                                        <td
                                          key={toStation.id}
                                          className="text-center bg-gray-50 border-b p-3 text-xs text-gray-400"
                                        >
                                          {reverse?.fare > 0
                                            ? `← ${Number(
                                                reverse.fare
                                              ).toLocaleString()} Ks`
                                            : '←'}
                                        </td>
                                      );
                                    }

                                    const key =
                                      `${fromStation.id}-${toStation.id}`;

                                    const item =
                                      fareMatrix[
                                        key
                                      ];

                                    return (
                                      <td
                                        key={toStation.id}
                                        className="border-b p-2 text-center bg-blue-50/30"
                                      >
                                        <input
                                          type="number"
                                          min="0"
                                          step="50"
                                          value={
                                            item?.fare ||
                                            ''
                                          }
                                          onChange={(event) =>
                                            handleFareChange(
                                              fromStation.id,
                                              toStation.id,
                                              event.target.value
                                            )
                                          }
                                          className="w-28 border rounded px-2 py-2 text-center"
                                          placeholder="Fare"
                                        />

                                        <div className="text-xs text-gray-500 mt-1">
                                          {item?.calculatedDistance ?? '?'}
                                          {' mi'}
                                        </div>
                                      </td>
                                    );
                                  }
                                )}
                              </tr>
                            )
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="p-6 text-center bg-gray-50 rounded-lg">
                    Need at least two route stations.
                  </div>
                )}

                {stations.length >= 2 && (
                  <div className="sticky bottom-0 bg-white border-t pt-4 flex gap-3">
                    <Button
                      type="button"
                      onClick={
                        handleSaveConfiguration
                      }
                      disabled={saving}
                      className="flex-1"
                    >
                      {saving ? (
                        <Loader className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4 mr-2" />
                      )}

                      Save {selectedCoachClass?.display_name || selectedClassType} fares
                    </Button>

                    <Button
                      type="button"
                      onClick={onClose}
                      className="bg-gray-100 text-gray-700 hover:bg-gray-200"
                    >
                      Close
                    </Button>
                  </div>
                )}
              </>
            )}

          {!loading &&
            trains.length === 0 && (
              <div className="p-8 text-center text-gray-500">
                No trains are assigned to this route.
              </div>
            )}

          {selectedTrain && (
            <p className="text-xs text-gray-400">
              Separate fare rules are saved per coach class for train #{selectedTrain.train_no || selectedTrain.id}.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default FeeConfigurationModal;
