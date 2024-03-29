const { Transaction } = require('sequelize')
const sequelize = require('../db/db')
const Order = require('../models/order')
const OrderItem = require('../models/orderItems')
const Product = require('../models/product')
const Cart = require('../models/cart')
const User = require('../models/user')
const CartItems = require('../models/cartItems')
const Address = require('../models/address')
const Country = require('../models/country')
const Image = require('../models/image')
const { createSession } = require('../utils/payment')
const stripe = require('stripe')(process.env.STRIPE_SK)

Order.belongsTo(User,{foreignKey: 'userId'})
Order.hasMany(OrderItem,{foreignKey: 'orderId'})
Order.belongsTo(Address,{foreignKey: "addressId"})
Address.hasMany(Order,{foreignKey: 'addressId'})
OrderItem.belongsTo(Order,{foreignKey:'orderId'})
OrderItem.belongsTo(Product,{foreignKey: 'productId'})

exports.addOrder = async(req,res) => {
    const t = await sequelize.transaction({
        isolationLevel: Transaction.ISOLATION_LEVELS.SERIALIZABLE
    })
    try {
        const {userId,addressId} = req.body
        const cart = await Cart.findOne({
            where: {userId},
            transaction:t
        })
        if(!cart){
            return res.status(404).json("cart not found")
        }
        const cartItems = await CartItems.findAll({
            where:{cartId: cart.cartId},
            include:[
                {
                    model: Product,
                    attributes: ['productId','name','description','quantity','price']
                }
            ],
            transaction:t,
            attributes: ['itemId','cartId','quantity']
        })

        const order = await Order.create({userId,addressId}, {transaction:t})

        let lineItems=[]

        for(const item of cartItems){
            console.log("Product quantity:",item.product.quantity,"\nCart quantity:",item.quantity);
            // console.log("hello");
            const product = await Product.findByPk(item.product.productId,{
                lock: t.LOCK.UPDATE
            })

            if(!product || item.product.quantity < item.quantity){
                // if(item.product.quantity == null) continue
                return res.status(400).json("insufficient quantity")
            }

            await Product.update(
                {quantity: item.product.quantity - item.quantity},
                {where: {productId: item.product.productId}, transaction:t}
            )
 
            await OrderItem.create({
                orderId: order.orderId,
                productId: item.product.productId,
                quantity: item.quantity,
                price: item.product.price,
            }, {transaction: t})

            lineItems.push({
                quantity: item.quantity,
                price_data:{
                    currency: "inr",
                    product_data:{
                        name: product.name
                    },
                    tax_behavior: "inclusive",
                    unit_amount_decimal: product.price * 100
                }
            })
        }

        const {url,id} = await createSession(lineItems,order.orderId)

        await Order.update({
            stripePaymentId: id
        },{where:{orderId: order.orderId},transaction:t})

        await Cart.destroy({where:{userId}, transaction:t})
        await t.commit()
        
        return res.status(200).json({url, message: "order placed"});
    } catch (error) {
        console.error(error);
        return res.status(500).json("Internal Server Error")
    }
}

exports.getAllOrdersForAUser = async(req,res)=> {
    try {
        const {userId} = req.params

        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 6;
        const offset = (page - 1) * pageSize;

        const orders = await Order.findAndCountAll({
            where:{
                userId
            },
            include:[
                {
                    model: OrderItem,
                    attributes:['productId','quantity','price'],
                    include:[
                        {
                            model: Product,
                            attributes: ['name', 'description'],
                            include: [
                                {
                                    model: Image,
                                    attributes: ['imageURL']
                                }
                            ]
                        }
                    ]
                }
            ],
            attributes:['orderId','amount','totalAmount','shippingAmount','stripePaymentId'],
            limit: pageSize,
            offset: offset,
        })
        
        if(orders.count == 0){
            return res.status(400).json("no orders found")
        }

        const totalPages = Math.ceil(orders.count / pageSize);


        const response = {
            orders: orders.rows,
            pagination: {
                page: page,
                pageSize: pageSize,
                totalProducts: orders.count,
                totalPages: totalPages,
            },
        };

        return res.status(200).json(response);
    } catch (error) {
        console.error(error);
        return res.status(500).json("Internal Server Error")
    }
}

exports.success = async(req,res) => {
    try {
        const {orderid} = req.query 
        const order = await Order.findByPk(orderid)

        if(!order) return res.status(400).json("order not found")

        const stripeId = String(order.stripePaymentId)

        const session = await stripe.checkout.sessions.retrieve(stripeId)
        
        await Order.update({
            amount: session?.amount_subtotal/100,
            shippingAmount: session?.shipping_cost.amount_total/100,
            totalAmount: session?.amount_total/100,
            payment_status: session?.status
        },{where:{orderId: orderid}})

        return res.status(200).json("succesful payment")
    } catch (error) {
        console.error(error);
        return res.status(500).json("Internal Server Error")
    }
}

exports.getOrderDetails = async(req,res) => {
    try {
        const {id} = req.params 

        const order = await Order.findOne({
            where:{orderId: id},
            include:[
                {
                    model: OrderItem,
                    attributes: ['quantity', 'price'],
                    include:[
                        {
                            model:Product,
                            attributes:['name','description'],
                            include:[
                                {
                                    model: Image,
                                    attributes: ['imageURL']
                                }
                            ]
                        }
                    ]
                }
            ],
            attributes:['orderId']
        })

        return res.status(200).json(order)
    } catch (error) {
        console.error(error);
        return res.status(500).json("Internal Server Error")
    }
}

exports.getAllOrdersForAdmin = async(req,res) => {
    try {

        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 6;
        const offset = (page - 1) * pageSize;

        const orders = await Order.findAndCountAll({
            attributes: ['orderId','totalAmount'],
            include:[
                {
                    model: OrderItem,
                    attributes: ['quantity','price'],
                    include:[
                        {
                            model: Product,
                            attributes: ['name']
                        }
                    ]
                },
                {
                    model: User,
                    attributes: ['first_name','last_name','email'],
                    include: [
                        {
                            model: Address,
                            attributes:['address_line_1','address_line_2','city','state','zipCode'],
                            include: [
                                {
                                    model: Country,
                                    attributes: ['countryName']
                                }
                            ]
                        }
                    ],
                    subQuery: false
                }
            ],
            limit: pageSize,
            offset: offset,
        })


        if(orders.count ==  0) return res.status(404).json("no orders found")

    const totalPages = Math.ceil(orders.count / pageSize);


        const response = {
            orders: orders.rows,
            pagination: {
                page: page,
                pageSize: pageSize,
                totalProducts: orders.count,
                totalPages: totalPages,
            },
        };

        return res.status(200).json(response);

    } catch (error) {
        console.error(error);
        return res.status(500).json("Internal Server Error")
    }
}