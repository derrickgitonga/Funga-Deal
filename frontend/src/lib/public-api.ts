import axios from "axios";

const publicApi = axios.create({ baseURL: "/" });

export default publicApi;
