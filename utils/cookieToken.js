const jwt = require('jsonwebtoken')

const cookieToken = (user,res) => {
    const token = jwt.sign({id:user.userId}, process.env.JWT_SECRET,{expiresIn: process.env.JWT_EXPIRY})

    const options = {
        expires: new Date(
            Date.now() + process.env.COOKIE_TIME * 24*60*60*1000
        ),
        httpOnly: true
    }

    res.status(200).cookie('token',token,options).json({
        success: true,
        token,
        userId: user.userId
    })
}

module.exports = cookieToken