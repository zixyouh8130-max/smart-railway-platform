import React, {
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  AlertCircle,
  Calculator,
  Loader,
  Train,
  X,
} from 'lucide-react';

import feesApi from '@/api/fees';
import trainsApi from '@/api/trains';


const PriceMatrixModal = ({
  isOpen,
  onClose,
  routeId,
}) => {
  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState(null);

  const [priceMatrix, setPriceMatrix] =
    useState(null);

  const [trains, setTrains] =
    useState([]);

  const [
    selectedTrainId,
    setSelectedTrainId,
  ] = useState(null);

  const [
    fareCoachTypes,
    setFareCoachTypes,
  ] = useState([]);

  const [
    selectedClassType,
    setSelectedClassType,
  ] = useState('');

  const selectedTrain =
    useMemo(
      () =>
        trains.find(
          (train) =>
            Number(train.id) ===
            Number(selectedTrainId)
        ) || null,
      [trains, selectedTrainId]
    );

  useEffect(() => {
    if (!isOpen || !routeId) {
      return;
    }

    const loadTrains = async () => {
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
          list[0]?.id || null
        );
      } catch (err) {
        setError(
          err.detail ||
          'Failed to load trains'
        );
      }
    };

    loadTrains();
  }, [isOpen, routeId]);

  useEffect(() => {
    if (!selectedTrainId) {
      setFareCoachTypes([]);
      setSelectedClassType('');
      setPriceMatrix(null);
      return;
    }

    const loadCoachTypes =
      async () => {
        setLoading(true);
        setError(null);

        try {
          const response =
            await feesApi
              .getFareCoachTypes(
                selectedTrainId
              );

          const types =
            response.coach_types ||
            [];

          setFareCoachTypes(
            types
          );

          setSelectedClassType(
            types[0]
              ?.class_type || ''
          );

          if (!types.length) {
            setPriceMatrix(null);
          }
        } catch (err) {
          setError(
            err.detail ||
            'Failed to load passenger coach types'
          );
        } finally {
          setLoading(false);
        }
      };

    loadCoachTypes();
  }, [selectedTrainId]);

  useEffect(() => {
    if (
      !selectedTrainId ||
      !selectedClassType
    ) {
      return;
    }

    const loadMatrix =
      async () => {
        setLoading(true);
        setError(null);

        try {
          const response =
            await feesApi
              .getPriceMatrix(
                selectedTrainId,
                selectedClassType
              );

          setPriceMatrix(
            response
          );
        } catch (err) {
          setPriceMatrix(null);

          setError(
            err.detail ||
            'Failed to fetch price matrix'
          );
        } finally {
          setLoading(false);
        }
      };

    loadMatrix();
  }, [
    selectedTrainId,
    selectedClassType,
  ]);

  const formatCurrency = (
    amount
  ) => {
    if (
      amount === null ||
      amount === undefined
    ) {
      return '-';
    }

    return (
      Number(
        amount
      ).toLocaleString() +
      ' MMK'
    );
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white flex items-center justify-between gap-4 p-6 border-b z-10">
          <div>
            <h2 className="text-xl font-bold">
              Price Matrix
            </h2>

            <p className="text-sm text-gray-600 mt-1">
              Fares by passenger coach type
            </p>
          </div>

          <div className="flex items-center gap-3">
            {trains.length > 0 && (
              <select
                value={
                  selectedTrainId ||
                  ''
                }
                onChange={(event) =>
                  setSelectedTrainId(
                    Number(
                      event.target.value
                    )
                  )
                }
                className="px-3 py-2 border rounded-lg"
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

            {fareCoachTypes.length >
              0 && (
              <select
                value={
                  selectedClassType
                }
                onChange={(event) =>
                  setSelectedClassType(
                    event.target.value
                  )
                }
                className="px-3 py-2 border rounded-lg"
              >
                {fareCoachTypes.map(
                  (item) => (
                    <option
                      key={
                        item.class_type
                      }
                      value={
                        item.class_type
                      }
                    >
                      {item.display_name}
                      {' ('}
                      {item.coach_count}
                      {' coach'}
                      {item.coach_count !==
                      1
                        ? 'es'
                        : ''}
                      {')'}
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

        <div className="p-6">
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2 mb-5">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
              <span className="text-red-700">
                {error}
              </span>
            </div>
          )}

          {loading && (
            <div className="py-12 flex justify-center">
              <Loader className="w-8 h-8 animate-spin" />
            </div>
          )}

          {!loading &&
            selectedTrainId &&
            !fareCoachTypes.length && (
              <div className="text-center py-12">
                <Train className="w-12 h-12 text-gray-400 mx-auto mb-4" />

                <h3 className="font-medium">
                  No passenger fare coaches
                </h3>

                <p className="text-sm text-gray-500 mt-1">
                  Add Upper Class, Economy Class, or Sleeper coaches to this train.
                </p>
              </div>
            )}

          {!loading &&
            priceMatrix?.stations && (
              <>
                <div className="mb-4 p-3 bg-indigo-50 rounded-lg">
                  <span className="text-sm text-indigo-700">
                    <strong>
                      {selectedTrain?.train_no}
                    </strong>
                    {' · '}
                    {
                      fareCoachTypes.find(
                        (item) =>
                          item.class_type ===
                          selectedClassType
                      )?.display_name ||
                      selectedClassType
                    }
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        <th className="sticky left-0 bg-gray-100 p-3 text-left border-b z-10">
                          From ↓ / To →
                        </th>

                        {priceMatrix.stations.map(
                          (station) => (
                            <th
                              key={station.id}
                              className="bg-gray-100 p-3 text-center border-b min-w-[110px]"
                            >
                              {station.name}
                            </th>
                          )
                        )}
                      </tr>
                    </thead>

                    <tbody>
                      {priceMatrix.stations.map(
                        (
                          fromStation,
                          fromIndex
                        ) => (
                          <tr
                            key={
                              fromStation.id
                            }
                          >
                            <td className="sticky left-0 bg-white p-3 border-b font-medium z-10">
                              {
                                fromStation.name
                              }
                            </td>

                            {priceMatrix.stations.map(
                              (
                                toStation,
                                toIndex
                              ) => {
                                if (
                                  fromIndex >=
                                  toIndex
                                ) {
                                  return (
                                    <td
                                      key={toStation.id}
                                      className="text-center p-3 border-b bg-gray-50 text-gray-400"
                                    >
                                      {fromIndex ===
                                      toIndex
                                        ? '—'
                                        : '←'}
                                    </td>
                                  );
                                }

                                const price =
                                  priceMatrix.prices?.find(
                                    (item) =>
                                      Number(
                                        item.from_id
                                      ) ===
                                        Number(
                                          fromStation.id
                                        ) &&
                                      Number(
                                        item.to_id
                                      ) ===
                                        Number(
                                          toStation.id
                                        )
                                  );

                                return (
                                  <td
                                    key={toStation.id}
                                    className="text-center p-3 border-b bg-green-50/30"
                                  >
                                    {price ? (
                                      <>
                                        <div className="font-semibold text-green-700">
                                          {formatCurrency(
                                            price.fare
                                          )}
                                        </div>

                                        {price.distance !==
                                          null &&
                                          price.distance !==
                                            undefined && (
                                            <div className="text-xs text-gray-500">
                                              {price.distance}
                                              {' mi'}
                                            </div>
                                          )}
                                      </>
                                    ) : (
                                      <span className="text-gray-400">
                                        N/A
                                      </span>
                                    )}
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

                {priceMatrix.prices?.length >
                  0 && (
                  <div className="mt-5 p-4 bg-gray-50 rounded-xl grid sm:grid-cols-4 gap-3 text-sm">
                    <div>
                      Pairs:{' '}
                      <strong>
                        {
                          priceMatrix
                            .prices
                            .length
                        }
                      </strong>
                    </div>

                    <div>
                      Min:{' '}
                      <strong>
                        {formatCurrency(
                          Math.min(
                            ...priceMatrix
                              .prices
                              .map(
                                (item) =>
                                  item.fare
                              )
                          )
                        )}
                      </strong>
                    </div>

                    <div>
                      Max:{' '}
                      <strong>
                        {formatCurrency(
                          Math.max(
                            ...priceMatrix
                              .prices
                              .map(
                                (item) =>
                                  item.fare
                              )
                          )
                        )}
                      </strong>
                    </div>

                    <div>
                      Average:{' '}
                      <strong>
                        {formatCurrency(
                          Math.round(
                            priceMatrix
                              .prices
                              .reduce(
                                (
                                  sum,
                                  item
                                ) =>
                                  sum +
                                  Number(
                                    item.fare
                                  ),
                                0
                              ) /
                              priceMatrix
                                .prices
                                .length
                          )
                        )}
                      </strong>
                    </div>
                  </div>
                )}
              </>
            )}

          {!loading &&
            fareCoachTypes.length >
              0 &&
            !priceMatrix && (
              <div className="text-center py-12">
                <Calculator className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="font-medium">
                  No configured fares
                </h3>
              </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default PriceMatrixModal;
