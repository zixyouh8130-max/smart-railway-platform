import api from './axios';

const feesApi = {
  getFareCoachTypes: async (trainId) => {
    try {
      const response = await api.get(
        `/fees/coach-types/${trainId}`
      );

      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  calculateFee: async (data) => {
    try {
      const response = await api.post(
        '/fees/calculate',
        {
          train_id: data.train_id,
          route_id:
            data.route_id ?? null,
          from_station_id:
            data.from_station_id,
          to_station_id:
            data.to_station_id,
          class_type:
            data.class_type || 'UPPER_CLASS',
          seat_type:
            data.seat_type || null,
        }
      );

      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  getPriceMatrix: async (
    trainId,
    classType = 'ECONOMY_CLASS'
  ) => {
    try {
      const response = await api.get(
        `/fees/price-matrix/${trainId}`,
        {
          params: {
            class_type: classType,
          },
        }
      );

      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  generateFeeRules: async (
    trainId,
    {
      base_fare = 0,
      per_mile_rate,
      class_type = 'ECONOMY_CLASS',
      surcharge_percentage = 0,
      overwrite_existing = false,
    }
  ) => {
    try {
      const response = await api.post(
        `/fees/generate-rules/${trainId}`,
        {
          base_fare,
          per_mile_rate,
          class_type,
          seat_type: null,
          surcharge_percentage,
          overwrite_existing,
        }
      );

      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  getFeeRules: async (
    trainId,
    filters = {}
  ) => {
    try {
      const response = await api.get(
        `/fees/rules/train/${trainId}`,
        {
          params: filters,
        }
      );

      return response.data;
    } catch (error) {
      if (error.response?.status === 404) {
        return [];
      }

      throw error.response?.data || error;
    }
  },

  saveFeeRule: async (ruleData) => {
    try {
      const response = await api.post(
        '/fees/rules',
        {
          train_id:
            ruleData.train_id,
          route_id:
            ruleData.route_id,
          from_station_id:
            ruleData.from_station_id,
          to_station_id:
            ruleData.to_station_id,

          base_fare:
            Number(
              ruleData.base_fare
            ) || 0,

          per_mile_rate:
            Number(
              ruleData.per_mile_rate
            ) || 0,

          class_type:
            ruleData.class_type ||
            'UPPER_CLASS',

          // Fare is coach-class based.
          seat_type: null,

          calculated_distance:
            ruleData
              .calculated_distance
            ?? null,

          surcharge_percentage:
            Number(
              ruleData
                .surcharge_percentage
            ) || 0,

          is_active:
            ruleData.is_active
            !== false,
        }
      );

      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  updateFeeRule: async (
    ruleId,
    ruleData
  ) => {
    try {
      const response = await api.put(
        `/fees/rules/${ruleId}`,
        ruleData
      );

      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  deleteFeeRule: async (ruleId) => {
    try {
      const response = await api.delete(
        `/fees/rules/${ruleId}`
      );

      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  // POST /fees/rules is an upsert, so save each matrix cell through
  // the supported endpoint.
  bulkUpdateFeeRules: async (
    _trainId,
    data
  ) => {
    const rules = data?.rules || [];
    const results = [];

    for (const rule of rules) {
      results.push(
        await feesApi.saveFeeRule(rule)
      );
    }

    return {
      created_or_updated:
        results.length,
      rules: results,
    };
  },
};

export default feesApi;
