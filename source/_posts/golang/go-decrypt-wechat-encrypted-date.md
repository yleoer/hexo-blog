---
title: Go实现微信加密数据解密算法
excerpt: Go 语言如何解密小程序中微信服务器的加密数据。
categories: Golang
tags:
  - 微信
  - 小程序
  - base64
  - aes
abbrlink: 10894eaa
date: 2022-01-20 10:00:00
---

## 概述

根据 [微信官方文档](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/signature.html#%E5%8A%A0%E5%AF%86%E6%95%B0%E6%8D%AE%E8%A7%A3%E5%AF%86%E7%AE%97%E6%B3%95) 的指南，后端解密需要小程序前端传递的数据包括：

- 用户登录凭证 `code`，后端可以换取用户唯一标识 `openid` 和会话密钥 `session_key`。
- 加密数据 `encryptedData`。
- 加密算法初始向量 `iv`。

## 登录凭证校验

根据 [auth.code2Session](https://developers.weixin.qq.com/miniprogram/dev/api-backend/open-api/login/auth.code2Session.html) 文档指南，后端根据前端传递的 `code` 调用微信服务器提供的接口完成登录流程，获取 `openid` 和 `session_key`。

这一步仅仅是一个 HTTP 的 GET 请求，然后解析响应。

```go
const (
	baseUrl   = "https://api.weixin.qq.com/sns/jscode2session"
    // 小程序 appid
    appID     = "xxx"
    // 小程序 appSecret
    appSecret = "mmm"
)

// SessionResult 登录凭证校验响应结构
type SessionResult struct {
    OpenID     string `json:"openid"`      // 用户唯一标识
	SessionKey string `json:"session_key"` // 会话密钥
	UnionID    string `json:"unionid"`     // 用户在开放平台的唯一标识符
	ErrCode    int    `json:"errcode"`     // 错误码
	ErrMsg     string `json:"errmsg"`      // 错误信息
}

// Login 登录凭证校验
func Login(code string) (*SessionResult, error) {
    // 拼接完整 URL 地址
    url := fmt.Sprintf(
		"%s?appid=%s&secret=%s&js_code=%s&grant_type=authorization_code",
		baseUrl, appID, appSecret, code,
	)
    // 请求 URL
    resp, err := http.Get(url)
    if err != nil {
        return nil, err
    }
    // JSON 序列化
    var result SessionResult
    if err = json.NewDecoder(resp.Body).Decode(&result); err != nil {
        return nil, err
    }
    // 判断错误码
    if result.ErrCode != 0 {
        return nil, fmt.Errorf("failure %d:%s", result.ErrCode, result.ErrMsg)
    }
    
    return &result, nil
}
```

## 加密数据解密

解密算法如下：

1. base64 解码 `session_key`。
2. base64 解码 `iv`。
3. base64 解码 `encryptedData`。
4. 使用 AES-128-CBC 对称解密，数据采用 PKCS#7 填充。

对于 Go 语言来说，需要编写的是对称解密这一步，因为官方库并没有实现 AES 对称解密，需要自己手动实现。

```go
var (
	ErrIllegalBuffer = errors.New("解密后的数据非法")
)

// WXBizDataCrypt 解密实体
type WXBizDataCrypt struct {
	appID      string // 加密数据归属 appid
	sessionKey string // 加密数据获取时的时间戳
}

// UserInfo 用户信息实体
type UserInfo struct {
	OpenID          string    `json:"openId"`          // 用户唯一标识
	NickName        string    `json:"nickName"`        // 用户昵称
    Gender          int       `json:"gender"`          // 用户性别 (0:未知 1:男性 2:女性)
	City            string    `json:"city"`            // 用户所在城市
	Province        string    `json:"province"`        // 用户所在省份
	Country         string    `json:"country"`         // 用户所在国家
	AvatarUrl       string    `json:"avatarUrl"`       // 用户头像图片 URL
	UnionID         string    `json:"unionId"`         // 用户在开放平台的唯一标识符
    PhoneNumber     string    `json:"phoneNumber"`     // 用户绑定的手机号
	PurePhoneNumber string    `json:"purePhoneNumber"` // 没有区号的手机号
	CountryCode     string    `json:"countryCode"`     // 区号
	WaterMark       WaterMark `json:"watermark"`       // 数据水印
}

// WaterMark 数据水印
type WaterMark struct {
	AppID     string `json:"appid"`
	Timestamp int64 `json:"timestamp"`
}

// NewDataCrypt 根据 appid 和 session_key 创建新的解密实体
func NewDataCrypt(appID, sessionKey string) *WXBizDataCrypt {
    return &WXBizDataCrypt{
        appID:      appID,
        sessionKey: sessionKey,
    }
}

// Decrypt 解密数据
func (c *WXBizDataCrypt) Decrypt(encryptedData, iv string) (*UserInfo, error) {
    // 1. base64 解码 session_key
    aesKey, err := base64.StdEncoding.DecodeString(c.sessionKey)
    if err != nil {
        return nil, err
    }
    // 2. base64 解码 iv
    aesIV, err := base64.StdEncoding.DecodeString(iv)
    if err != nil {
        return nil, err
    }
    // 3. base64 解码 encryptedData
    aesCipher, err := base64.StdEncoding.DecodeString(encryptedData)
    if err != nil {
        return nil, err
    }
    // 4. AES-128-CBC 对称解密
    cipherBlock, err := aes.NewCipher(aesKey)
    if err != nil {
        return nil, err
    }
    cipher.NewCBCDecrypter(cipherBlock, aesIV).CryptBlocks(aesCipher, aesCipher)
    decrypted := c.pkcs7UnPadding(aesCipher)
    // 5. JSON 序列化
    var userInfo UserInfo
    if err = json.Unmarshal(decrypted, &userInfo); err != nil {
        // JSON 序列化失败表示加密数据非法
        return nil, ErrIllegalBuffer
    }
    // 6. 判断数据水印
    if c.appID != userInfo.WaterMark.AppID {
        // 加密数据中的 appid 和前端传输的 appid 不一致，表示加密数据非法
        return nil, ErrIllegalBuffer
    }
    return &userInfo, nil
}

// pkcs7UnPadding PKCS#7填充
func (c *WXBizDataCrypt) pkcs7UnPadding(data []byte) {
    length := len(data)
    unPadding := int(data[length-1])
    return data[:(length - unPadding)]
}
```
