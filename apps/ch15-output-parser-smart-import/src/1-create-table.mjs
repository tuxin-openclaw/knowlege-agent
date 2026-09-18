import "@knowledge/course-utils/env";
import mysql from "mysql2/promise";

const connection = await mysql.createConnection({
  host: process.env.MYSQL_HOST,
  port: process.env.MYSQL_PORT,
  user: process.env.MYSQL_USERNAME,
  password: process.env.MYSQL_PASSWORD,
  multipleStatements: true, // 允许执行多条 SQL 语句
});

try {
  // 创建 database
  await connection.query(
    `CREATE DATABASE IF NOT EXISTS agent CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
  );
  await connection.query(`USE agent;`);

  // 创建好友表
  await connection.query(`
    CREATE TABLE IF NOT EXISTS friends (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(50) NOT NULL,
      gender VARCHAR(10),        -- 性别
      birth_date DATE,           -- 出生日期
      company VARCHAR(100),      -- 公司
      title VARCHAR(100),        -- 职位
      phone VARCHAR(20),         -- 当前手机号
      wechat VARCHAR(50)         -- 微信号
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // 插入数据
  const insertSql = `
    INSERT INTO friends (name, gender, birth_date, company, title, phone, wechat)
    VALUES (?, ?, ?, ?, ?, ?, ?);
  `;
  const values = [
    "张三",
    "男",
    "1990-01-01",
    "ABC Company",
    "Software Engineer",
    "1234567890",
    "zhangsan",
  ];

  const [result] = await connection.execute(insertSql, values);
  console.log("🚀 ~ result:", result);
} catch (error) {
  console.log("❌ ~ error:", error);
}

connection.end();
