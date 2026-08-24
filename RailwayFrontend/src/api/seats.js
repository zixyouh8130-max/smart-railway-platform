import api from './axios';

const seatsApi = {
  getScheduleSeatMap: async (scheduleId) => {
    try {
      const response = await api.get(
        `/seats/schedule/${scheduleId}`
      );
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },

  checkAvailability: async (seatId, scheduleId) => {
    try {
      const response = await api.get(
        `/seats/${seatId}/availability`,
        { params: { schedule_id: scheduleId } }
      );
      return response.data;
    } catch (error) {
      throw error.response?.data || error;
    }
  },
};

export default seatsApi;
