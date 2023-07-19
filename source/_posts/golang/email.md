---
title: Golang 发送邮件
excerpt: Go 语言通过 SMTP 协议发送邮件。
tags: SMTP
categories: Golang
abbrlink: 65f50995
date: 2021-08-23 15:55:39
---

## 配置 SMTP 服务

发送邮件时需要与邮箱服务提供商的 SMTP 服务器通信，将邮件标题、内容、收件人地址等信息发送到 SMTP 服务器。随后，SMTP 服务器将该封邮件投递到收件人地址所有的 SMTP 服务器。收件人才能看到该封邮件。

配置 SMTP 服务以 QQ 邮箱为例。

登录 QQ 邮箱后，电点击左上方名字下的 “设置”，选择 “账户” 栏，下拉到 “POP3、IMAP...服务” 位置，选择开启  “POP3/SMTP 服务”。

开启 SMTP 服务后点击下方蓝色的 “生成授权码”，使用手机发送指定的短信后，获取到授权码，保存该授权码，发送邮件时需要。

## 官方库

```go
var (
    // 发送人邮箱地址
	fromUser = "xx@qq.com"
	// 密码/授权码
	password = "xxx"
	// 接收人邮箱地址，可同时发送多人
	toUser = []string{"xx@163.com"}
	// SMTP 服务地址，此处为 QQ 邮箱的 SMTP 服务的地址
	smtpServiceAddr = "smtp.qq.com"
	// SMTP 服务端口，此处为 QQ 邮箱的 SMTP 服务的端口
	smtpServicePort = 587
	// 邮件内容，此处格式是必须如下
	msg = fmt.Sprintf(
		"To: %s\r\nSubject: %s\r\n\r\n%s\r\n",
		toUser, "hello world", "This is the email body.",
	)
	// SMTP 服务所需的授权信息
	auth = smtp.PlainAuth("", fromUser, password, smtpServiceAddr)
)

func main() {
    err := smtp.SendMail(
		fmt.Sprintf("%s:%d", smtpServiceAddr, smtpServicePort),
		auth,
        fmt.Sprintf("xx <%s>", fromUser),
        toUser, []byte(msg),
	)

	if err != nil {
		log.Fatalf("Send email error: %s.", err)
	}

	log.Println("Send email success.")
}
```

## 第三方库

[email](https://github.com/jordan-wright/email)

```go
func main() {
	e := email.NewEmail()
	e.From = "xx <xx@qq.com>"
	e.To = toUser
	e.Subject = "hello world"
    
    // Text 为纯文本内容
	e.Text = []byte("This is the email body.")
    // HTML 为 HTML 内容，实际测试会覆盖 Text 内容
    e.HTML = []byte("<span style=\"color: red;\">This is the email body.</span>")
    // 附件
    e.AttachFile("test.xlsx")
    // 抄送
    e.Cc = []string{"xx@126.com"}
    // 秘密抄送
    e.Bcc = []string{"xx@aliyun.com"}

	err := e.Send(
		fmt.Sprintf("%s:%d", smtpServiceAddr, smtpServicePort),
		auth,
	)

	if err != nil {
		log.Fatalf("Send email error: %s.", err)
	}

	log.Println("Send email success.")
}
```

