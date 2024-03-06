const express = require('express');
const app = express() //app phai la 1 ham
const port = 3003 //phan biet hoa thuong
const multer = require('multer');
const AWS = require('aws-sdk');
require("dotenv").config();
const path = require('path');

process.env.AWS_SDK_JS_SUPRESS_MAINTENANCE_MODE_MESSAGE = "1"
AWS.config.update({
    region: process.env.REGION,
    accessKeyId: process.env.ACCESS_KEY_ID,
    secretAccessKey: process.env.SECRET_ACCESS_KEY
})
const s3 = new AWS.S3()
const dynamodb = new AWS.DynamoDB.DocumentClient()
const bucketName = process.env.S3_BUCKET_NAME
const tableName = process.env.DYNAMODB_TABLE_NAME


// let course = require('./data')

app.use(express.urlencoded({ extended: true }));
app.use(express.static('./views'))
app.set('view engine', 'ejs')
app.set('views', './views')


// // Thiết lập Multer để lưu trữ tệp tải lên trong thư mục 'uploads'
// const storage = multer.diskStorage({
//     destination: function(req, file, cb) {
//         cb(null, 'views/uploads/');
//     },
//     filename: function(req, file, cb) {
//         cb(null, Date.now() + path.extname(file.originalname));
//     }
// });
const storage = multer.memoryStorage({
    destination(req, file, callback) {
        callback(null, "")
    }
})

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // Giới hạn kích thước file ảnh là 10MB
    fileFilter: function (req, file, cb) { // Lọc chỉ cho phép file jpg, png
        if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png') {
            cb(null, true);
        } else {
            cb(new Error('Chỉ được tải lên file JPG hoặc PNG!'));
        }
    }
});

app.get('/', async (req, resp) => {
    try {
        const params = { TableName: tableName }
        const data = await dynamodb.scan(params).promise()
        // console.log(data.Items)
        return resp.render("index.ejs", { data: data.Items })
    } catch (error) {
        console.error("LOAD DU LIEU KHONG DUOC BECAUSE ", error)
        return resp.status(500).send("Internal Server Error")
    }
})

app.post('/add', upload.single('image'), (req, resp) => {
    try {
        // Kiểm tra các trường dữ liệu nhập vào
        const id = Number(req.body.id);
        if (isNaN(id) || id < 0) {
            return resp.status(400).send('ID phải là số nguyên dương!');
        }

        const name = req.body.name;
        if (!/^[A-Z][a-zA-Z\s]*$/.test(name)) {
            return resp.status(400).send('Tên môn học không hợp lệ!');
        }

        const course_type = req.body.course_type;
        if (!/^[A-Z][a-zA-Z\s]*$/.test(course_type)) {
            return resp.status(400).send('Loại môn học không hợp lệ!');
        }

        const semester = req.body.semester;
        if (!/^(HK1|HK2|HK3)-([0-9]{4})-([0-9]{4})$/.test(semester)) {
            return resp.status(400).send('Hoc ky không hợp lệ!');
        }

        const department = req.body.department;
        if (!/^K\.[A-Z]{1,4}$/.test(department)) {
            return resp.status(400).send('Khoa không hợp lệ!');
        }
        const image_url = req.file?.originalname.split(".") // Lấy đường dẫn tới hình ảnh
        //Lay file type de tao file path
        const fileType = image_url[image_url.length - 1]
        //tao file path de bo vao param
        const filePath = `${id}_${Date.now().toString()}.${fileType}`
        if (!image_url) {
            return resp.status(400).send('Ảnh không được để trống và phải có định dạng JPG hoặc PNG!');
        }
        //xac dinh param (tep)
        const params = {
            Bucket: bucketName,
            Key: filePath,
            Body: req.file.buffer,
            ContentType: req.file.mimetype
        };
        //tai param (tep)
        s3.upload(params, async (err, data) => {
            if (err) {
                console.error("error-", err)
                return resp.send("Internal server error")
            } else {
                //Neu tai tep thanh cong
                const imageUrl = data.Location //lay duong dan tep de bo vao param item (doi tuong them vo data)
                const paramsDynamodb = {
                    TableName: tableName,
                    Item: {
                        id: Number(id),
                        name: name,
                        course_type: course_type,
                        semester: semester,
                        department: department,
                        image_url: imageUrl
                    }
                }
                await dynamodb.put(paramsDynamodb).promise()
                // console.log(paramsDynamodb);
                return resp.redirect("/")
            }
        })
    } catch (err) {
        console.error("ADD DU LIEU KHONG DUOC BECAUSE: ", err)
        return resp.status(500).send("Internal Server Error")
    }


});


app.post('/delete', async (req, resp) => {
    try {
        //Lấy danh sách các khóa học được chọn để xóa
        const selectedCourses = req.body.selectedCourses;
        // console.log(selectedCourses);

        // Kiểm tra xem có khóa học nào được chọn không
        if (!selectedCourses) {
            return resp.redirect("/")
        } else if (!Array.isArray(selectedCourses)) {
            const paramsDynamodb = {
                TableName: tableName,
                Key: {
                    id: Number(selectedCourses)
                }
            };
            await dynamodb.delete(paramsDynamodb).promise();
            
        } else {
           // Không dùng for each vì sẽ tạo ra hàm mới và await không gọi trong hàm được
           for (const courseId of selectedCourses) {
            const paramsDynamodb = {
                TableName: tableName,
                Key: {
                    id: Number(courseId)
                }
            };
            await dynamodb.delete(paramsDynamodb).promise();
        }
        }

        // Chuyển hướng trở lại trang chủ sau khi xóa thành công
        return resp.redirect('/');

    } catch (err) {
        console.error("DELETE DU LIEU KHONG DUOC BECAUSE: ", err)
        return resp.status(500).send("Internal Server Error")
    }

});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`) //phai la dau nhay `
})