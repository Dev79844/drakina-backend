const sequelize = require('../db/db')
const {DataTypes} = require('sequelize')

const CartItems = sequelize.define('cartitems',{
    itemId:{
        type:DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
    },
    productId:{
        type: DataTypes.INTEGER
    },
    spellId:{
        type: DataTypes.INTEGER,
    },
    cartId:{
        type: DataTypes.INTEGER,
        allowNull: false
    },
    quantity:{
        type: DataTypes.INTEGER,
        allowNull:false,
    }
},{timestamps:true})

module.exports = CartItems