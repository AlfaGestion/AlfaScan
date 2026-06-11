package com.sunmi.trans;

import android.os.Parcel;
import android.os.Parcelable;

public class TransBean implements Parcelable {
  private byte type = 0;
  private String text = "";
  private byte[] data = null;
  private int dataLength = 0;

  public TransBean() {
    this.type = 0;
    this.text = "";
    this.data = null;
    this.dataLength = 0;
  }

  public TransBean(Parcel source) {
    this.type = source.readByte();
    this.dataLength = source.readInt();
    this.text = source.readString();
    if (this.dataLength > 0) {
      this.data = new byte[this.dataLength];
      source.readByteArray(this.data);
    }
  }

  public TransBean(byte type, String text, byte[] data) {
    this.type = type;
    this.text = text;
    setData(data);
  }

  public byte getType() {
    return type;
  }

  public void setType(byte type) {
    this.type = type;
  }

  public String getText() {
    return text;
  }

  public void setText(String text) {
    this.text = text;
  }

  public byte[] getData() {
    return data;
  }

  public void setData(byte[] data) {
    if (data == null || data.length == 0) {
      this.data = null;
      this.dataLength = 0;
      return;
    }

    this.dataLength = data.length;
    this.data = new byte[this.dataLength];
    System.arraycopy(data, 0, this.data, 0, this.dataLength);
  }

  @Override
  public int describeContents() {
    return 0;
  }

  @Override
  public void writeToParcel(Parcel dest, int flags) {
    dest.writeByte(type);
    dest.writeInt(dataLength);
    dest.writeString(text);
    if (data != null) {
      dest.writeByteArray(data);
    }
  }

  public static final Creator<TransBean> CREATOR = new Creator<TransBean>() {
    @Override
    public TransBean createFromParcel(Parcel source) {
      return new TransBean(source);
    }

    @Override
    public TransBean[] newArray(int size) {
      return new TransBean[size];
    }
  };
}
