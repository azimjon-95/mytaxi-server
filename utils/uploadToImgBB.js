const axios = require("axios");
const FormData = require("form-data");
require("dotenv").config();

const uploadToImgBB = async (buffer) => {
    const formData = new FormData();
    formData.append("image", buffer.toString("base64"));

    const response = await axios.post(
        `https://api.imgbb.com/1/upload?key=${process.env.IMGBB_API_KEY}`,
        formData,
        { headers: formData.getHeaders() }
    );

    return response.data.data.url;
};

module.exports = uploadToImgBB;
