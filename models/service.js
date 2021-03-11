var mongoose = require("mongoose");
var AutoIncrement = require("mongoose-sequence")(mongoose)

var ServiceSchema = new mongoose.Schema({
    s_id: Number,
    name: String,
    desc: String,
    fee: Number,
    fee_t: {
        type: String,
        enum: ['/ hour','/ day','/ job'],
        default: '/ hour'
    },
    ratings: [
        {
            _id: false,
            username: String,
            rating: Number
        }
    ],
    avg_rating: Number,
    sp_name: String

});

ServiceSchema.plugin(AutoIncrement, {inc_field:"s_id"})
module.exports = mongoose.model("service", ServiceSchema);
