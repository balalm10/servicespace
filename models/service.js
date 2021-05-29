var mongoose = require("mongoose");

var ServiceSchema = new mongoose.Schema({
    name: String,
    desc: String,
    image: String,
    fee: Number,
    fee_t: {
        type: String,
        enum: ['/ hour','/ day','/ job'],
        default: '/ hour'
    },
    ratings: [{
        _id: false,
        userid: {
            type:mongoose.Schema.Types.ObjectId,
            ref :"User"
        },
        rating: Number
    }],
    avg_rating: Number,
    watchlisted: Number,
    provider: {
        type:mongoose.Schema.Types.ObjectId,
        ref :"User"
    }
});

ServiceSchema.index({ name: 'text', desc: 'text'}, {name: 'Search Index', weights: {name: 5, desc: 2}})

module.exports = mongoose.model("Service", ServiceSchema);
