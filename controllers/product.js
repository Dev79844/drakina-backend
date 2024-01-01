const { Op } = require('sequelize');
const Category = require('../models/category');
const Product = require('../models/product')
const {uploadImages} = require('../utils/uploadImage')
const Image = require('../models/image')
const Collection = require('../models/collection')
const sequelize = require('../db/db');
const {deleteImage} = require('../utils/deleteImage');

Collection.hasMany(Product,{foreignKey: 'collectionId'})

Category.hasMany(Product,{foreignKey:'categoryId'})

Product.belongsTo(Category, {
  foreignKey: 'categoryId',
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE'
})

Product.hasMany(Image,{
  foreignKey: 'productId'
})

Image.belongsTo(Product,{
  foreignKey:'productId',
  onDelete: 'CASCADE',
  onUpdate: 'CASCADE'
})


exports.addProduct = async(req,res) => {
    try {
        const {name,categoryId,collectionId,description,quantity,price} = req.body 

        const product = await Product.create({
            name,
            categoryId,
            collectionId,
            description,
            quantity,
            price
        })

        if(req.files){
            const img = await uploadImages(res,req.files.images)
            img.forEach(async(image) => {
                await Image.create({
                    imageName: image.key,
                    imageURL: image.url,
                    productId: product.productId
                })
            });
        }
        return res.status(200).json("product added")
    } catch (error) {
        console.error(error);
        return res.status(500).json("Internal Server Error")
    }
}

exports.addCategory = async(req,res) => {
    const {categoryName} = req.body

    const exists = await Category.findOne({
        where:{
            categoryName:{
                [Op.iLike]: `%${categoryName}`
            }
        }
    })

    if(exists){
        return res.status(400).json("Category already exists")
    }

    await Category.create({
        categoryName
    })

    return res.status(200).json("Category added")
}

exports.getCategories = async(req,res) => {
    try {
        const categories = await Category.findAll()
        return res.status(200).json(categories)
    } catch (error) {
        console.error(error);
        return res.status(500).json("Internal Server Error")
    }
}

exports.addCollection = async(req,res) => {
    try {
        const {name} = req.body 

        const existing = await Collection.findOne({
            where:{
                name:{
                    [Op.iLike] : `%${name}`
                }
            }
        })

        if(existing){
            return res.status(400).json("collection already exists")
        }

        await Collection.create({
            name
        })

        return res.status(200).json("collection created")
    } catch (error) {
        console.error(error);
        return res.status(500).json("Internal Server Error")
    }
}

exports.getCollection = async(req,res) => {
    try {
        const collections = await Collection.findAll()
        if(!collections){
            return res.status(400).json("no collections found")
        }

        return res.status(200).json(collections)
    } catch (error) {
        console.error(error);
        return res.status(500).json("Internal Server Error")
    }
}

exports.getAllProducts = async(req,res) => {
    try {
        const products = await Product.findAll({
            include:[
                {
                    model: Category,
                    attributes:['categoryName']
                },
                {
                    model:Image,
                    attributes:['imageURL']
                }
            ],
            attributes:['productId','name','description','quantity','price']
        })

        if(!products){
            return res.status(400).json("no products found")
        }

        return res.status(200).json(products)
    } catch (error) {
        console.error(error);
        return res.status(500).json("Internal Server Error")
    }
}

exports.getAProduct = async(req,res) => {
    try {
        const {id} = req.params
        const product = await Product.findByPk(id,{
            include:[
                {
                    model: Category,
                    attributes:['categoryName']
                },
                {
                    model: Image,
                    attributes:['imageURL']
                }
            ],
            attributes:['productId','name','description','quantity','price']
        })

        if(!product){
            return res.status(404).json("Product not found")
        }

        return res.status(200).json(product)
    } catch (error) {
        console.error(error);
        return res.status(500).json("Internal Server Error")
    }
}

exports.updateProduct = async(req,res) => {
    const t = await sequelize.transaction()
    try {
        const {id} = req.params 
        const {name,price,description,quantity,categoryId,collectionId} = req.body

        const product = await Product.findByPk(id,{transaction:t})
        
        if(!product){
            return res.status(404).json("product not found!")
        }
        await Product.update(
            {name,price,description,quantity,categoryId,collectionId},
            {where: {productId: id}, transaction: t}
        )

        if(req.files){
            const img = await uploadImages(res,req.files.images)
            await Image.destroy({where: {productId: id}, transaction: t})
            img.forEach(async(image) => {
                await Image.create({
                    imageName: image.key,
                    imageURL: image.url,
                    productId: product.productId
                },{transaction: t})
            });
        }

        (await t).commit()
        const updatedProduct = await Product.findByPk(id,{
            include:[
                {
                    model: Category,
                    attributes:['categoryName']
                },
                {
                    model: Image,
                    attributes:['imageURL']
                }
            ]
        })
        return res.status(200).json(updatedProduct)
    } catch (error) {
        console.error(error);
        (await t).rollback()
        return res.status(500).json("Internal Server Error")
    }
}

exports.deleteProduct = async(req,res) => {
    const t = await sequelize.transaction()
    try {
        const {id} = req.params
        const images = await Image.findAll({
            where:{
                productId: id
            },
            transaction:t
        })
        if(images){
            images.forEach(async(res,image) => {
                await deleteImage(res,images[image].imageName)
            });
        }

        await Image.destroy({where:{productId:id},transaction:t})
        await Product.destroy({where:{productId:id},transaction:t})
        await t.commit()
        return res.status(200).json("product deleted")
    } catch (error) {
        console.error(error);
        await t.rollback()
        return res.status(500).json("Internal Server Error")
    }
}

exports.getProdutsByCategory = async(req,res) => {
    try {
        const {id} = req.params 

        const products = await Product.findAll({
            where:{
                categoryId: id
            },
            attributes: ['productId','name','price','quantity','description'],
            include:[
                {
                    model: Image,
                    attributes: ["imageURL"]
                }
            ]
        })

        if(products.length <= 0){
            return res.status(404).json("no products found")
        }

        return res.status(200).json(products)
    } catch (error) {
        console.error(error);
        return res.status(500).json("Internal Server Error")
    }
}

exports.getProductsByCollection = async(req,res) => {
    try {
        const {id} = req.params 
        const products = await Product.findAll({
            where: {
                collectionId: id
            },
            attributes:['productId','name', 'description','quantity','price'],
            include:[{
                model: Image,
                attributes:['imageURL','imageName']
            }]
        })

        if(!products){
            return res.status(200).json("no products in the collection")
        }

        return res.status(200).json({"products":products})
    } catch (error) {
        console.error(error);
        return res.status(500).json("Internal Server Error")
    }
}